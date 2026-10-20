import { Text } from './Typography';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, Dimensions, FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, ui } from './theme';

type Page<T> = { id: string; items: T[] };
export function HighlightsCarousel<T extends { id: string }>({ name, items, renderItem, itemsPerPage = 1 }: {
  name: string; items: T[]; renderItem: (item: T) => ReactNode; itemsPerPage?: number;
}) {
  const focused = useIsFocused(), { fontScale } = useWindowDimensions();
  const list = useRef<FlatList<Page<T>>>(null), frame = useRef<View>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const pageSize = Math.max(1, Math.floor(itemsPerPage));
  const pages = useMemo(() => {
    const shown = items.slice(0, 8 * pageSize), result: Page<T>[] = [];
    for (let start = 0; start < shown.length; start += pageSize) {
      const group = shown.slice(start, start + pageSize);
      result.push({ id: group.map(item => item.id).join('|'), items: group });
    }
    return result;
  }, [items, pageSize]);
  const columns = fontScale > 1.3 ? Math.min(2, pageSize) : pageSize;
  const [width, setWidth] = useState(300), [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(true), [reduce, setReduce] = useState(false), [reader, setReader] = useState(false);
  const visible = useRef(false), active = useRef(AppState.currentState === 'active');
  const touching = useRef(false), userPaused = useRef(false), interaction = useRef(false);
  const pagesRef = useRef(pages), indexRef = useRef(0);
  const [, renderInteraction] = useState(0);
  const key = `carousel-paused-${name}`;
  const pauseInteraction = () => { interaction.current = true; renderInteraction(value => value + 1); };
  const move = (next: number, animated: boolean) => {
    indexRef.current = next; setIndex(next);
    list.current?.scrollToOffset({ offset: next * width, animated });
  };
  function step(direction: number) {
    if (!pagesRef.current.length) return;
    pauseInteraction();
    move((indexRef.current + direction + pagesRef.current.length) % pagesRef.current.length, !reduce && !reader);
  }
  useEffect(() => {
    pagesRef.current = pages;
    const next = Math.min(indexRef.current, Math.max(0, pages.length - 1));
    move(next, false);
  }, [pages, width]);
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(key).then(value => { if (alive && !userPaused.current) setPaused(value === 'true'); }).catch(() => {});
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduce(value); });
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (alive) setReader(value); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    const screen = AccessibilityInfo.addEventListener('screenReaderChanged', setReader);
    const app = AppState.addEventListener('change', state => { active.current = state === 'active'; });
    const visibility = setInterval(() => frame.current?.measureInWindow((_x, y, _w, h) => {
      visible.current = y >= 0 && y + h <= Dimensions.get('window').height;
    }), 750);
    return () => { alive = false; motion.remove(); screen.remove(); app.remove(); clearInterval(visibility); };
  }, [key]);
  useEffect(() => {
    const canAdvance = () => focused && !paused && !reduce && !reader && active.current && visible.current && !touching.current && !interaction.current && pagesRef.current.length > 1;
    const timer = setInterval(() => {
      if (!canAdvance()) return;
      const next = (indexRef.current + 1) % pagesRef.current.length;
      Animated.timing(opacity, { toValue: .25, duration: 125, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        if (canAdvance()) move(next, false);
        Animated.timing(opacity, { toValue: 1, duration: 125, useNativeDriver: true }).start();
      });
    }, 7000);
    return () => { clearInterval(timer); opacity.stopAnimation(); opacity.setValue(1); };
  }, [focused, paused, reduce, reader, width, opacity]);
  return <View ref={frame} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ gap: 8 }}>
    <Animated.View style={{ opacity }}><FlatList ref={list} data={pages} horizontal pagingEnabled
      showsHorizontalScrollIndicator={false} keyExtractor={page => page.id}
      onTouchStart={() => { touching.current = true; }}
      onTouchEnd={() => { touching.current = false; pauseInteraction(); }}
      onTouchCancel={() => { touching.current = false; pauseInteraction(); }}
      onScrollBeginDrag={pauseInteraction}
      onMomentumScrollEnd={event => {
        const next = Math.max(0, Math.min(pagesRef.current.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
        indexRef.current = next; setIndex(next);
      }}
      renderItem={({ item: page, index: pageIndex }) => <View accessibilityElementsHidden={pageIndex!==index} importantForAccessibility={pageIndex!==index?'no-hide-descendants':'auto'} style={{ width, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {page.items.map(item => <View key={item.id} style={{ width: (width - 6 * (columns - 1)) / columns }}>{renderItem(item)}</View>)}
      </View>} /></Animated.View>
    <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 0 }]}>
      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }} accessibilityLabel={`Sida ${index + 1} av ${pages.length}`}>
        {pages.map((page, position) => <View key={page.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: position === index ? colors.blue : '#B9C8DA' }} />)}
        <Text style={[ui.meta, { marginLeft: 4 }]}>{pages.length ? `${index + 1} / ${pages.length}` : 'Inga uppdateringar'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Föregående höjdpunkt" disabled={pages.length < 2} onPress={() => step(-1)} style={{ minHeight: 44, minWidth: 44, padding: 10 }}><Text style={{ color: colors.blue }}>‹</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Nästa höjdpunkt" disabled={pages.length < 2} onPress={() => step(1)} style={{ minHeight: 44, minWidth: 44, padding: 10 }}><Text style={{ color: colors.blue }}>›</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={paused || interaction.current ? 'Starta automatisk växling' : 'Pausa automatisk växling'}
        disabled={reduce || reader || pages.length < 2} onPress={() => {
          const next = interaction.current ? false : !paused;
          interaction.current = false; userPaused.current = true; setPaused(next); renderInteraction(value => value + 1);
          void AsyncStorage.setItem(key, String(next)).catch(() => {});
        }} style={{ minHeight: 44, padding: 10 }}>
        <Text style={{ color: colors.blue, fontWeight: '700' }}>{reduce || reader ? 'Manuell växling' : paused || interaction.current ? '▶ Spela' : 'Ⅱ Pausa'}</Text>
      </Pressable>
    </View>
  </View>;
}
