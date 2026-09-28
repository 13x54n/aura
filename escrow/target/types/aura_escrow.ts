/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/aura_escrow.json`.
 */
export type AuraEscrow = {
  "address": "Df1YjMHGeeXVvayPHX7Vb5svqUkV3dbdfKU9D4UZ4m2",
  "metadata": {
    "name": "auraEscrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Aura Ludo room vault: stake escrow, winner payout, refunds (devnet)"
  },
  "instructions": [
    {
      "name": "deposit",
      "docs": [
        "Player moves exactly `stake` into the vault for `seat`. Only the wallet the",
        "referee bound to that seat at `init_room` may fund it (no open-seat squatting)."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "config",
          "relations": [
            "room"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.room_id",
                "account": "room"
              }
            ]
          }
        },
        {
          "name": "playerToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "room"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "seat",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initConfig",
      "docs": [
        "One config per mint. Only the program's upgrade authority can create it (no front-run)."
      ],
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasury"
        },
        {
          "name": "program",
          "address": "Df1YjMHGeeXVvayPHX7Vb5svqUkV3dbdfKU9D4UZ4m2"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "settleAuthority",
          "type": "pubkey"
        },
        {
          "name": "feeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "initRoom",
      "discriminator": [
        166,
        102,
        103,
        49,
        179,
        136,
        136,
        113
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "arg",
                "path": "roomId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "room"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "roomId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "stake",
          "type": "u64"
        },
        {
          "name": "seats",
          "type": "u8"
        },
        {
          "name": "diceCommit",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "depositDeadline",
          "type": "i64"
        },
        {
          "name": "refundAfterSecs",
          "type": "i64"
        },
        {
          "name": "players",
          "type": {
            "array": [
              "pubkey",
              4
            ]
          }
        }
      ]
    },
    {
      "name": "refund",
      "docs": [
        "Return each deposit to its own depositor. Remaining accounts = one token account",
        "per deposited seat, in seat order; each is checked against `players[]`."
      ],
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "relations": [
            "room"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.room_id",
                "account": "room"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "room"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "u8"
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "Referee pays pot − fee to the winning seat's depositor and fee to the treasury."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "relations": [
            "room"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.room_id",
                "account": "room"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "room"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "winnerToken",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "winnerSeat",
          "type": "u8"
        },
        {
          "name": "resultHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "diceSeed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "startMatch",
      "docs": [
        "Referee marks the first roll. After this, a referee refund needs a reason code."
      ],
      "discriminator": [
        100,
        246,
        223,
        181,
        176,
        101,
        255,
        19
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "relations": [
            "room"
          ]
        },
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "room.room_id",
                "account": "room"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateConfig",
      "docs": [
        "Admin: rotate the settle key / pause new rooms + deposits (refunds always work)."
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true
        },
        {
          "name": "treasury",
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "settleAuthority",
          "type": "pubkey"
        },
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "room",
      "discriminator": [
        156,
        199,
        67,
        27,
        222,
        23,
        185,
        94
      ]
    }
  ],
  "events": [
    {
      "name": "deposited",
      "discriminator": [
        111,
        141,
        26,
        45,
        161,
        35,
        100,
        57
      ]
    },
    {
      "name": "matchStarted",
      "discriminator": [
        69,
        179,
        169,
        249,
        67,
        123,
        163,
        173
      ]
    },
    {
      "name": "refunded",
      "discriminator": [
        35,
        103,
        149,
        246,
        196,
        123,
        221,
        99
      ]
    },
    {
      "name": "roomLocked",
      "discriminator": [
        139,
        9,
        142,
        55,
        220,
        219,
        98,
        158
      ]
    },
    {
      "name": "settled",
      "discriminator": [
        232,
        210,
        40,
        17,
        142,
        124,
        145,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Not allowed"
    },
    {
      "code": 6001,
      "name": "paused",
      "msg": "Escrow is paused"
    },
    {
      "code": 6002,
      "name": "badFee",
      "msg": "Fee too high"
    },
    {
      "code": 6003,
      "name": "badTreasury",
      "msg": "Treasury must not belong to the settle authority"
    },
    {
      "code": 6004,
      "name": "badStake",
      "msg": "Stake must be 1, 3, 5 or 10 USDC (6 decimals)"
    },
    {
      "code": 6005,
      "name": "badSeats",
      "msg": "Seats must be 2..=4"
    },
    {
      "code": 6006,
      "name": "badDeadline",
      "msg": "Deadline out of range"
    },
    {
      "code": 6007,
      "name": "badStatus",
      "msg": "Wrong room status"
    },
    {
      "code": 6008,
      "name": "depositClosed",
      "msg": "Deposit window closed"
    },
    {
      "code": 6009,
      "name": "badSeat",
      "msg": "Bad seat"
    },
    {
      "code": 6010,
      "name": "seatTaken",
      "msg": "Seat already funded"
    },
    {
      "code": 6011,
      "name": "alreadySeated",
      "msg": "Wallet already holds a seat"
    },
    {
      "code": 6012,
      "name": "badRecipient",
      "msg": "Recipient is not this seat's depositor"
    },
    {
      "code": 6013,
      "name": "duplicateRecipient",
      "msg": "Duplicate refund recipient"
    },
    {
      "code": 6014,
      "name": "badSeed",
      "msg": "Dice seed does not match commit"
    },
    {
      "code": 6015,
      "name": "settleExpired",
      "msg": "Settle window expired; refund instead"
    },
    {
      "code": 6016,
      "name": "refundNotAllowed",
      "msg": "Refund not allowed yet"
    },
    {
      "code": 6017,
      "name": "badPayer",
      "msg": "Rent must return to the room payer"
    },
    {
      "code": 6018,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6019,
      "name": "seatUnassigned",
      "msg": "Seat has no bound wallet"
    },
    {
      "code": 6020,
      "name": "notYourSeat",
      "msg": "This seat is bound to another wallet"
    },
    {
      "code": 6021,
      "name": "noSlotHash",
      "msg": "SlotHashes sysvar is empty"
    },
    {
      "code": 6022,
      "name": "notStarted",
      "msg": "Match hasn't started"
    },
    {
      "code": 6023,
      "name": "refundReasonRequired",
      "msg": "Refunding a started match needs a reason code"
    },
    {
      "code": 6024,
      "name": "vaultShort",
      "msg": "Vault holds less than stake x seats"
    }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "settleAuthority",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "deposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "room",
            "type": "pubkey"
          },
          {
            "name": "seat",
            "type": "u8"
          },
          {
            "name": "player",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "matchStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "room",
            "type": "pubkey"
          },
          {
            "name": "slotHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "refunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roomId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "room",
            "type": "pubkey"
          },
          {
            "name": "recipients",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "timeout",
            "type": "bool"
          },
          {
            "name": "reason",
            "type": "u8"
          },
          {
            "name": "started",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "room",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "roomId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "seats",
            "type": "u8"
          },
          {
            "name": "deposited",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "players",
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "diceCommit",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "depositDeadline",
            "type": "i64"
          },
          {
            "name": "settleDeadline",
            "type": "i64"
          },
          {
            "name": "refundAfterSecs",
            "type": "i64"
          },
          {
            "name": "lockSlotHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "lockedAt",
            "type": "i64"
          },
          {
            "name": "started",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "roomLocked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "room",
            "type": "pubkey"
          },
          {
            "name": "settleDeadline",
            "type": "i64"
          },
          {
            "name": "slotHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "settled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roomId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "room",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "winnerSeat",
            "type": "u8"
          },
          {
            "name": "pot",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "swept",
            "type": "u64"
          },
          {
            "name": "resultHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "diceSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "slotHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    }
  ]
};
