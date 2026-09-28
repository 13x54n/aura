//! aura_escrow — one vault per Ludo room (see docs/WALLET_AND_ESCROW.md).
//! The server is only the referee (`settle_authority`): it can pay the pot to a
//! seated depositor (+ fee to the treasury) or return deposits. It never holds funds.
use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

declare_id!("Df1YjMHGeeXVvayPHX7Vb5svqUkV3dbdfKU9D4UZ4m2");

pub const MAX_SEATS: usize = 4;
pub const MAX_FEE_BPS: u16 = 1_000;
/// Timeout refund window after lock: configurable per room, 60s..=2h.
pub const MIN_REFUND_AFTER: i64 = 60;
pub const MAX_REFUND_AFTER: i64 = 2 * 60 * 60;
/// Deposit (fill) window: 30s..=24h from init.
pub const MIN_DEPOSIT_WINDOW: i64 = 30;
pub const MAX_DEPOSIT_WINDOW: i64 = 24 * 60 * 60;
pub const OPEN: u8 = 0;
pub const LOCKED: u8 = 1;

#[program]
pub mod aura_escrow {
    use super::*;

    /// One config per mint. Only the program's upgrade authority can create it (no front-run).
    pub fn init_config(ctx: Context<InitConfig>, settle_authority: Pubkey, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, EscrowError::BadFee);
        // The referee key must never be the fee wallet (it never holds USDC).
        require_keys_neq!(ctx.accounts.treasury.owner, settle_authority, EscrowError::BadTreasury);
        ctx.accounts.config.set_inner(Config {
            admin: ctx.accounts.admin.key(),
            settle_authority,
            mint: ctx.accounts.mint.key(),
            treasury: ctx.accounts.treasury.key(),
            fee_bps,
            paused: false,
            bump: ctx.bumps.config,
        });
        Ok(())
    }

    /// Admin: rotate the settle key / pause new rooms + deposits (refunds always work).
    pub fn update_config(ctx: Context<UpdateConfig>, settle_authority: Pubkey, paused: bool) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.settle_authority = settle_authority;
        c.paused = paused;
        Ok(())
    }

    pub fn init_room(
        ctx: Context<InitRoom>,
        room_id: [u8; 16],
        stake: u64,
        seats: u8,
        dice_commit: [u8; 32],
        deposit_deadline: i64,
        refund_after_secs: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(stake > 0, EscrowError::BadStake);
        require!((2..=MAX_SEATS as u8).contains(&seats), EscrowError::BadSeats);
        stake.checked_mul(seats as u64).ok_or(EscrowError::Overflow)?;
        let lo = now.checked_add(MIN_DEPOSIT_WINDOW).ok_or(EscrowError::Overflow)?;
        let hi = now.checked_add(MAX_DEPOSIT_WINDOW).ok_or(EscrowError::Overflow)?;
        require!(deposit_deadline >= lo && deposit_deadline <= hi, EscrowError::BadDeadline);
        require!(
            (MIN_REFUND_AFTER..=MAX_REFUND_AFTER).contains(&refund_after_secs),
            EscrowError::BadDeadline
        );
        ctx.accounts.room.set_inner(Room {
            config: ctx.accounts.config.key(),
            payer: ctx.accounts.authority.key(),
            room_id,
            stake,
            seats,
            deposited: 0,
            status: OPEN,
            bump: ctx.bumps.room,
            players: [Pubkey::default(); MAX_SEATS],
            dice_commit,
            deposit_deadline,
            settle_deadline: 0,
            refund_after_secs,
        });
        Ok(())
    }

    /// Player moves exactly `stake` into the vault for `seat`.
    pub fn deposit(ctx: Context<Deposit>, seat: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let player = ctx.accounts.player.key();
        let room = &ctx.accounts.room;
        require!(!ctx.accounts.config.paused, EscrowError::Paused);
        require!(room.status == OPEN, EscrowError::BadStatus);
        require!(now <= room.deposit_deadline, EscrowError::DepositClosed);
        require!(seat < room.seats, EscrowError::BadSeat);
        require!(room.deposited & (1u8 << seat) == 0, EscrowError::SeatTaken);
        for i in 0..room.seats as usize {
            if room.deposited & (1u8 << i) != 0 {
                require_keys_neq!(room.players[i], player, EscrowError::AlreadySeated);
            }
        }
        let stake = room.stake;
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.player_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.player.to_account_info(),
                },
            ),
            stake,
            ctx.accounts.mint.decimals,
        )?;
        let key = ctx.accounts.room.key();
        let room = &mut ctx.accounts.room;
        room.players[seat as usize] = player;
        room.deposited |= 1u8 << seat;
        emit!(Deposited { room: key, seat, player });
        if room.deposited.count_ones() == room.seats as u32 {
            room.status = LOCKED;
            room.settle_deadline = now.checked_add(room.refund_after_secs).ok_or(EscrowError::Overflow)?;
            emit!(RoomLocked { room: key, settle_deadline: room.settle_deadline });
        }
        Ok(())
    }

    /// Referee pays pot − fee to the winning seat's depositor and fee to the treasury.
    pub fn settle(ctx: Context<Settle>, winner_seat: u8, result_hash: [u8; 32], dice_seed: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let room = &ctx.accounts.room;
        require!(room.status == LOCKED, EscrowError::BadStatus);
        require!(now <= room.settle_deadline, EscrowError::SettleExpired);
        require!(winner_seat < room.seats, EscrowError::BadSeat);
        require!(room.deposited & (1u8 << winner_seat) != 0, EscrowError::BadSeat);
        let winner = room.players[winner_seat as usize];
        require_keys_eq!(ctx.accounts.winner_token.owner, winner, EscrowError::BadRecipient);
        require!(hash(&dice_seed).to_bytes() == room.dice_commit, EscrowError::BadSeed);

        let pot = ctx.accounts.vault.amount;
        let fee = u64::try_from(
            (pot as u128)
                .checked_mul(ctx.accounts.config.fee_bps as u128)
                .ok_or(EscrowError::Overflow)?
                / 10_000u128,
        )
        .map_err(|_| EscrowError::Overflow)?;
        let payout = pot.checked_sub(fee).ok_or(EscrowError::Overflow)?;

        let room_id = room.room_id;
        let bump = [room.bump];
        let seeds: &[&[&[u8]]] = &[&[b"room", room_id.as_ref(), &bump]];
        let a = &ctx.accounts;
        let (tp, vault, mint, auth) = (
            a.token_program.to_account_info(),
            a.vault.to_account_info(),
            a.mint.to_account_info(),
            a.room.to_account_info(),
        );
        pay(&tp, &vault, &mint, &a.winner_token.to_account_info(), &auth, seeds, payout, a.mint.decimals)?;
        pay(&tp, &vault, &mint, &a.treasury.to_account_info(), &auth, seeds, fee, a.mint.decimals)?;
        close_vault(&tp, &vault, &a.payer.to_account_info(), &auth, seeds)?;
        emit!(Settled {
            room_id,
            room: a.room.key(),
            winner,
            winner_seat,
            pot,
            fee,
            payout,
            result_hash,
            dice_seed,
        });
        Ok(()) // `close = payer` closes Room on exit
    }

    /// Return each deposit to its own depositor. Remaining accounts = one token account
    /// per deposited seat, in seat order; each is checked against `players[]`.
    pub fn refund<'info>(ctx: Context<'_, '_, 'info, 'info, Refund<'info>>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let room = &ctx.accounts.room;
        let is_ref = ctx.accounts.caller.key() == ctx.accounts.config.settle_authority;
        let allowed = match room.status {
            OPEN => is_ref || now > room.deposit_deadline,
            LOCKED => is_ref || now > room.settle_deadline,
            _ => false,
        };
        require!(allowed, EscrowError::RefundNotAllowed);

        let n = room.deposited.count_ones() as usize;
        require!(ctx.remaining_accounts.len() == n, EscrowError::BadRecipient);
        let room_id = room.room_id;
        let bump = [room.bump];
        let seeds: &[&[&[u8]]] = &[&[b"room", room_id.as_ref(), &bump]];
        let a = &ctx.accounts;
        let (tp, vault, mint, auth) = (
            a.token_program.to_account_info(),
            a.vault.to_account_info(),
            a.mint.to_account_info(),
            a.room.to_account_info(),
        );
        let mut seen: Vec<Pubkey> = Vec::with_capacity(n);
        let mut k = 0usize;
        for i in 0..room.seats as usize {
            if room.deposited & (1u8 << i) == 0 {
                continue;
            }
            let info = &ctx.remaining_accounts[k];
            k += 1;
            require!(!seen.contains(info.key), EscrowError::DuplicateRecipient);
            seen.push(*info.key);
            require!(info.is_writable, EscrowError::BadRecipient);
            // Owned by the token program + valid layout, right mint, owned by that seat's depositor.
            let ta = Account::<TokenAccount>::try_from(info)?;
            require_keys_eq!(ta.mint, a.mint.key(), EscrowError::BadRecipient);
            require_keys_eq!(ta.owner, room.players[i], EscrowError::BadRecipient);
            pay(&tp, &vault, &mint, info, &auth, seeds, room.stake, a.mint.decimals)?;
        }
        // Anything sent to the vault outside `deposit` goes to the treasury so the vault can close.
        let mut v = a.vault.clone();
        v.reload()?;
        pay(&tp, &vault, &mint, &a.treasury.to_account_info(), &auth, seeds, v.amount, a.mint.decimals)?;
        close_vault(&tp, &vault, &a.payer.to_account_info(), &auth, seeds)?;
        emit!(Refunded { room_id, room: a.room.key(), recipients: seen, timeout: !is_ref });
        Ok(())
    }
}

fn pay<'info>(
    tp: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    seeds: &[&[&[u8]]],
    amount: u64,
    decimals: u8,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let accs = TransferChecked { from: from.clone(), mint: mint.clone(), to: to.clone(), authority: authority.clone() };
    token::transfer_checked(CpiContext::new_with_signer(tp.clone(), accs, seeds), amount, decimals)
}

fn close_vault<'info>(
    tp: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
    dest: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    seeds: &[&[&[u8]]],
) -> Result<()> {
    let accs = CloseAccount { account: vault.clone(), destination: dest.clone(), authority: authority.clone() };
    token::close_account(CpiContext::new_with_signer(tp.clone(), accs, seeds))
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config", mint.key().as_ref()], bump)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(token::mint = mint)]
    pub treasury: Account<'info, TokenAccount>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ EscrowError::Unauthorized)]
    pub program: Program<'info, crate::program::AuraEscrow>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ EscrowError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin @ EscrowError::Unauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(room_id: [u8; 16])]
pub struct InitRoom<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        has_one = mint,
        constraint = config.settle_authority == authority.key() @ EscrowError::Unauthorized,
        constraint = !config.paused @ EscrowError::Paused,
    )]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(init, payer = authority, space = 8 + Room::INIT_SPACE, seeds = [b"room", room_id.as_ref()], bump)]
    pub room: Account<'info, Room>,
    #[account(init, payer = authority, associated_token::mint = mint, associated_token::authority = room)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub player: Signer<'info>,
    #[account(has_one = mint)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(mut, has_one = config, seeds = [b"room", room.room_id.as_ref()], bump = room.bump)]
    pub room: Account<'info, Room>,
    #[account(mut, token::mint = mint, token::authority = player)]
    pub player_token: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = room)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub authority: Signer<'info>,
    #[account(
        has_one = mint,
        has_one = treasury,
        constraint = config.settle_authority == authority.key() @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(mut, has_one = config, close = payer, seeds = [b"room", room.room_id.as_ref()], bump = room.bump)]
    pub room: Account<'info, Room>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = room)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint)]
    pub winner_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury: Account<'info, TokenAccount>,
    /// CHECK: rent refund target, pinned to the account that paid for the room.
    #[account(mut, address = room.payer @ EscrowError::BadPayer)]
    pub payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    pub caller: Signer<'info>,
    #[account(has_one = mint, has_one = treasury)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(mut, has_one = config, close = payer, seeds = [b"room", room.room_id.as_ref()], bump = room.bump)]
    pub room: Account<'info, Room>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = room)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury: Account<'info, TokenAccount>,
    /// CHECK: rent refund target, pinned to the account that paid for the room.
    #[account(mut, address = room.payer @ EscrowError::BadPayer)]
    pub payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub settle_authority: Pubkey,
    pub mint: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Room {
    pub config: Pubkey,
    pub payer: Pubkey,
    pub room_id: [u8; 16],
    pub stake: u64,
    pub seats: u8,
    pub deposited: u8,
    pub status: u8,
    pub bump: u8,
    pub players: [Pubkey; MAX_SEATS],
    pub dice_commit: [u8; 32],
    pub deposit_deadline: i64,
    pub settle_deadline: i64,
    pub refund_after_secs: i64,
}

#[event]
pub struct Deposited {
    pub room: Pubkey,
    pub seat: u8,
    pub player: Pubkey,
}

#[event]
pub struct RoomLocked {
    pub room: Pubkey,
    pub settle_deadline: i64,
}

#[event]
pub struct Settled {
    pub room_id: [u8; 16],
    pub room: Pubkey,
    pub winner: Pubkey,
    pub winner_seat: u8,
    pub pot: u64,
    pub fee: u64,
    pub payout: u64,
    pub result_hash: [u8; 32],
    pub dice_seed: [u8; 32],
}

#[event]
pub struct Refunded {
    pub room_id: [u8; 16],
    pub room: Pubkey,
    pub recipients: Vec<Pubkey>,
    pub timeout: bool,
}

#[error_code]
pub enum EscrowError {
    #[msg("Not allowed")]
    Unauthorized,
    #[msg("Escrow is paused")]
    Paused,
    #[msg("Fee too high")]
    BadFee,
    #[msg("Treasury must not belong to the settle authority")]
    BadTreasury,
    #[msg("Stake must be > 0")]
    BadStake,
    #[msg("Seats must be 2..=4")]
    BadSeats,
    #[msg("Deadline out of range")]
    BadDeadline,
    #[msg("Wrong room status")]
    BadStatus,
    #[msg("Deposit window closed")]
    DepositClosed,
    #[msg("Bad seat")]
    BadSeat,
    #[msg("Seat already funded")]
    SeatTaken,
    #[msg("Wallet already holds a seat")]
    AlreadySeated,
    #[msg("Recipient is not this seat's depositor")]
    BadRecipient,
    #[msg("Duplicate refund recipient")]
    DuplicateRecipient,
    #[msg("Dice seed does not match commit")]
    BadSeed,
    #[msg("Settle window expired; refund instead")]
    SettleExpired,
    #[msg("Refund not allowed yet")]
    RefundNotAllowed,
    #[msg("Rent must return to the room payer")]
    BadPayer,
    #[msg("Arithmetic overflow")]
    Overflow,
}
