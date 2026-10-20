import { Text } from './Typography';
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, AppState, Image, Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cachedCajklopsVideo } from './cajklopsAssets';
import { readLaunchPreferences } from './launchPreferences';
import { createIntroPlayback } from './launchPlayback';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export function CajklopsLaunch({ children, ready }: PropsWithChildren<{ ready: boolean }>) {
  const [visible, setVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const complete = useCallback(() => setVisible(false), []);
  useEffect(() => {
    const cancel = readLaunchPreferences({
      readMotion: () => AccessibilityInfo.isReduceMotionEnabled(), onMotion:setReduceMotion});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { cancel(); motion.remove(); };
  }, []);
  return <View style={s.root}>
    <View style={s.root} pointerEvents={visible ? 'none' : 'auto'}
      accessibilityElementsHidden={visible} importantForAccessibility={visible ? 'no-hide-descendants' : 'auto'}>
      {children}
    </View>
    {visible && (reduceMotion !== null
      ? <LaunchVideo reduceMotion={reduceMotion} ready={ready} onComplete={complete}/>
      : <View style={s.overlay}><StatusBar hidden/><Image source={require('../assets/cajklops-poster.png')}
        style={s.media} resizeMode="contain" accessibilityLabel="Cajklops"
        onLoad={() => { void SplashScreen.hideAsync().catch(() => {}); }}/></View>)}
  </View>;
}

function LaunchVideo({ reduceMotion, ready, onComplete }: { reduceMotion: boolean; ready: boolean; onComplete: () => void }) {
  const [posterReady, setPosterReady] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [firstFrame, setFirstFrame] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const closing = useRef(false);
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(null, p => {
    p.loop = false;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.staysActiveInBackground = false;
    p.pause();
  });
  const playback = useMemo(() => createIntroPlayback(player), [player]);
  const finish = useCallback((duration?: number) => {
    if (closing.current) return;
    closing.current = true;
    void SplashScreen.hideAsync().catch(() => {});
    Animated.timing(opacity, { toValue: 0, duration: reduceMotion ? 0 : duration ?? 700,
      useNativeDriver: true }).start(({finished}) => { if (finished) { player.pause(); onComplete(); } });
  }, [opacity, player, reduceMotion, onComplete]);
  useEffect(() => {
    if (reduceMotion) return;
    let alive = true;
    void cachedCajklopsVideo(require('../assets/cajklops-opening.mp4')).then(async uri => {
      if (!alive || closing.current) return;
      await player.replaceAsync({uri});
      if (alive && !closing.current) { player.pause(); player.currentTime = 0; setMediaReady(true); }
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [player, reduceMotion]);
  useEffect(() => {
    if (!posterReady || closing.current) return;
    let alive = true;
    void SplashScreen.hideAsync().catch(() => {}).then(() => {
      if (!alive || closing.current) return;
      setSplashHidden(true);
    });
    return () => { alive = false; };
  }, [posterReady]);
  useEffect(() => {
    if (!posterReady || !splashHidden || !mediaReady || !firstFrame || !foreground || reduceMotion || ended || failed || closing.current) {
      playback.sync(false);
      return;
    }
    // Let React reveal the decoded frame before advancing the video clock.
    const frame = requestAnimationFrame(() => playback.sync(true));
    return () => { cancelAnimationFrame(frame); playback.sync(false); };
  }, [posterReady, splashHidden, mediaReady, firstFrame, foreground, reduceMotion, ended, failed, playback]);
  useEffect(() => {
    const end = player.addListener('playToEnd', () => setEnded(true));
    const status = player.addListener('statusChange', event => {
      if (event.status === 'error') setFailed(true);
    });
    if (player.status === 'error') setFailed(true);
    const app = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active') player.pause();
    });
    return () => { end.remove(); status.remove(); app.remove(); };
  }, [player]);
  useEffect(() => {
    if (!ready || !posterReady) return;
    if (reduceMotion || ended || failed) finish();
  }, [ready, posterReady, reduceMotion, ended, failed, finish]);
  useEffect(() => {
    // Guards cover loading only; playback is allowed its entire duration.
    if (reduceMotion || firstFrame || ended || failed || !foreground) return;
    const deadline = setTimeout(() => setFailed(true), mediaReady ? 10000 : 20000);
    return () => clearTimeout(deadline);
  }, [mediaReady, firstFrame, ended, failed, foreground, reduceMotion]);
  return <Animated.View style={[s.overlay, { opacity }]}>
      <StatusBar hidden />
      <Image source={require('../assets/cajklops-poster.png')} style={s.media} resizeMode="contain"
        accessibilityLabel="Cajklops. Ett öga i en gyllene triangel."
        onLoad={() => setPosterReady(true)} onError={() => setPosterReady(true)} />
      {!reduceMotion && <VideoView player={player} nativeControls={false}
        contentFit="contain" surfaceType="textureView" accessible={false}
        style={[s.media, { opacity: firstFrame && !failed ? 1 : 0 }]}
        onFirstFrameRender={() => setFirstFrame(true)} />}
      {!ready && (ended || failed || reduceMotion) && <Text style={[s.waiting, {bottom:insets.bottom+42}]}
        accessibilityLiveRegion="polite">Öppnar Cajklops…</Text>}
      {!mediaReady && !reduceMotion && !failed && <Text style={[s.waiting, {bottom:insets.bottom+42}]}
        accessibilityLiveRegion="polite">Förbereder öppningen…</Text>}
      <Pressable onPress={() => finish(150)} style={[s.skip, { top: insets.top + 12 }]}
        accessibilityRole="button" accessibilityLabel="Hoppa över Cajklops öppningsanimation" hitSlop={12}>
        <Text style={s.skipText}>Hoppa över</Text>
      </Pressable>
    </Animated.View>;
}
const s = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: '#FAFBFE', zIndex: 999 },
  media: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  skip: { position: 'absolute', right: 24, paddingHorizontal: 12, paddingVertical: 10 },
  skipText: { color: '#2187F5', fontSize: 12, letterSpacing: 0.5 },
  waiting: {position:'absolute',left:24,right:24,textAlign:'center',color:'#11152A',
    fontSize:13,letterSpacing:0.5,padding:12,backgroundColor:'#E8F2FF',borderRadius:16},
});
