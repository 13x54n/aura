import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
  ViewToken,
} from "react-native";
import { Text } from "react-native-paper";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

export type HeroSlide = {
  id: string;
  title: string;
  blurb: string;
  /** Full-bleed HTTPS art (Xbox-ref style). */
  imageUrl: string;
  /** Fallback tint while the remote image loads. */
  accent?: string;
  onPlay: () => void;
};

type Props = {
  slides: HeroSlide[];
  /** Auto-advance interval ms; 0 disables. */
  autoMs?: number;
};

const { width: SCREEN_W } = Dimensions.get("window");
const HERO_H = 560;

function SlideCard({
  slide,
  width,
}: {
  slide: HeroSlide;
  width: number;
}) {
  return (
    <View style={[styles.slide, { width }]}>
      <ImageBackground
        source={{ uri: slide.imageUrl }}
        style={[styles.art, { backgroundColor: slide.accent ?? "#3B1D6E" }]}
        imageStyle={styles.artImage}
        resizeMode="cover"
      >
        <LinearGradient
          pointerEvents="none"
          colors={[
            "transparent",
            "rgba(12, 11, 20, 0.35)",
            "rgba(12, 11, 20, 0.82)",
            "rgba(12, 11, 20, 0.95)",
          ]}
          locations={[0, 0.35, 0.7, 1]}
          style={styles.artFade}
        />
        <View style={styles.overlay}>
          <Text style={styles.forYou}>For You</Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.blurb}>{slide.blurb}</Text>
          <Pressable onPress={slide.onPlay} style={styles.playWrap}>
            {Platform.OS !== "web" ? (
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.playFallback]} />
            )}
            <Text style={styles.playLabel}>Play</Text>
          </Pressable>
        </View>
      </ImageBackground>
    </View>
  );
}

/** Swipe + auto-advance hero with live dots + remote bg art. */
export function FeaturedHero({ slides, autoMs = 4500 }: Props) {
  const listRef = useRef<FlatList<HeroSlide>>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const count = slides.length;

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (count < 2 || autoMs <= 0) return;
    const id = setInterval(() => {
      const next = (indexRef.current + 1) % count;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    }, autoMs);
    return () => clearInterval(id);
  }, [count, autoMs]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const i = viewableItems[0]?.index;
      if (typeof i === "number") setIndex(i);
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 60,
  }).current;

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / SCREEN_W);
      if (i >= 0 && i < count) setIndex(i);
    },
    [count]
  );

  if (count === 0) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, i) => ({
          length: SCREEN_W,
          offset: SCREEN_W * i,
          index: i,
        })}
        renderItem={({ item }) => <SlideCard slide={item} width={SCREEN_W} />}
      />
      <View style={styles.dots}>
        {slides.map((s, i) => (
          <Pressable
            key={s.id}
            onPress={() => {
              listRef.current?.scrollToIndex({ index: i, animated: true });
              setIndex(i);
            }}
            hitSlop={8}
          >
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  slide: {
    height: HERO_H,
    overflow: "hidden",
  },
  art: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "flex-end",
  },
  artImage: {
    width: "100%",
    height: "100%",
  },
  artFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "72%",
  },
  overlay: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: "center",
  },
  forYou: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 8,
  },
  title: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 32,
    marginBottom: 6,
    textAlign: "center",
  },
  blurb: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 18,
    maxWidth: 300,
  },
  playWrap: {
    overflow: "hidden",
    borderRadius: 24,
    paddingHorizontal: 36,
    paddingVertical: 12,
    backgroundColor: "rgba(20,16,36,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
    minWidth: 120,
    alignItems: "center",
  },
  playFallback: { backgroundColor: "rgba(20,16,36,0.75)" },
  playLabel: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 17,
    zIndex: 1,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  dotActive: {
    width: 18,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
});
