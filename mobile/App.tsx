import { Text, TextInput } from './src/Typography';
import { useEffect, useRef, useState, type ComponentType } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from "expo-status-bar";
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from "expo-blur";
import MapView, {
  Marker,
  Polygon,
  Polyline,
} from "react-native-maps";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  API_BASE,
  calculateRoute,
  geocode,
  refreshRoute,
  type AreasResponse,
  type CrisisResponse,
  type EventsResponse,
  type FeedResponse,
  type MapItemsResponse,
  type RouteResponse,
  type ZonesResponse,
} from "./src/api";
import { Dashboard, type Destination } from "./src/Dashboard";
import { FamilyProvider } from "./src/FamilyState";
import {useFamily} from './src/FamilyState';
import {positionFresh} from './src/mobileState';
import { polygonParts, validAt, destinationOnly, eventPoint, km } from "./src/mobileState";
import { MapLegend } from "./src/MapPreview";
import { AlarmCoordinator } from "./src/FamilyAlarmScreen";
import { NavigationContainer, createNavigationContainerRef, useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import { AppDataProvider, useAppData, useFeedInterest } from './src/AppData';
import { CommunityMarkers } from './src/CommunityMarkers';
import type { CommunityPage } from './src/communityApi';
import { CommunityScreen } from './src/CommunityScreen';
import { ComposeReportScreen } from './src/ComposeReportScreen';
import { ReportDetailScreen } from './src/ReportDetailScreen';
import { AccountScreen } from './src/AccountScreen';
import { NewsScreen, NewsDetailScreen } from './src/NewsScreen';
import { PolicyScreen, BlockedUsersScreen } from './src/PolicyScreen';
import { EventsScreen } from './src/EventsScreen';
import type { RootStackParams,PrototypeTabParams } from './src/navigation';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { useMapCommunity } from './src/useMapCommunity';
import { useVisibleClock } from './src/useVisibleClock';
import {PrototypeTabs,PrototypeFeatureFrame,isPrototypeTab,openPrototypeTab} from './src/PrototypeChrome';
import {prototypeMapStyles as s} from './src/PrototypeMapStyles';
import {prototypeTabAction} from './src/prototypeNavigation';
import { TryggPulseBrand } from './src/CajklopsBrand';
import {useFonts} from 'expo-font';
import {interfaceFonts} from './src/Typography';
import {referenceMapStyle} from './src/referenceMapStyle';
import {IncidentHeat,PlaceLabel} from './src/ReferenceKit';
import {neighborhoodRegion} from './src/homeMapState';
import {FamilyMapScreen} from './src/FamilyMapScreen';
import {familyMapStyle} from './src/FamilyMapDetails';

if (process.env.EXPO_PUBLIC_SENTRY_DSN) Sentry.init({dsn:process.env.EXPO_PUBLIC_SENTRY_DSN,sendDefaultPii:false,enableNative:Constants.appOwnership!=='expo',beforeSend(event){delete event.user;delete event.request;delete event.breadcrumbs;delete event.extra;return event;}});
const Stack = createNativeStackNavigator<RootStackParams>();
const Tabs=createBottomTabNavigator<PrototypeTabParams>();
const navigationRef = createNavigationContainerRef<RootStackParams>();
function featureFrame<P extends object>(Screen:ComponentType<P>){return (props:P)=><PrototypeFeatureFrame><Screen {...props}/></PrototypeFeatureFrame>;}
const FramedAccount=featureFrame(AccountScreen),FramedCommunity=featureFrame(CommunityScreen),FramedCompose=featureFrame(ComposeReportScreen),FramedReport=featureFrame(ReportDetailScreen),FramedNewsDetail=featureFrame(NewsDetailScreen),FramedPolicy=featureFrame(PolicyScreen),FramedBlocks=featureFrame(BlockedUsersScreen);
function PrototypeMain(){return <Tabs.Navigator initialRouteName="home" screenOptions={{headerShown:false,freezeOnBlur:true,animation:'none'}} tabBar={props=><PrototypeTabs {...props}/>}><Tabs.Screen name="home" component={AppScreen}/><Tabs.Screen name="map" component={AppScreen}/><Tabs.Screen name="stats" component={AppScreen}/><Tabs.Screen name="places" component={AppScreen}/><Tabs.Screen name="info" component={AppScreen}/></Tabs.Navigator>;}

type Tab = Destination;
const blue = "#2187F5",
  ink = "#11152A",
  muted = "#607287";
const toMap = ([lon, lat]: number[]) => ({ latitude: lat, longitude: lon });
function Source({ label, status }: { label: string; status?: string }) {
  return (
    <View style={s.source}>
      <View
        style={[
          s.dot,
          { backgroundColor: status === "ok" ? "#19A978" : "#E5A34B" },
        ]}
      />
      <Text style={s.sourceName}>{label}</Text>
      <Text style={s.sourceState}>
        {status === "ok"
          ? "Aktuell"
          : status === "stale"
            ? "Äldre data"
            : status === "requires_setup"
              ? "Ej ansluten"
              : "Ej tillgänglig"}
      </Text>
    </View>
  );
}
function AppScreen() {
  const inset = useSafeAreaInsets(),
    map = useRef<MapView>(null),
    fade = useRef(new Animated.Value(1)).current;
  const navigation = useNavigation<any>(), screenRoute=useRoute(),tab = screenRoute.name as Tab;
  const {height}=useWindowDimensions(),mapPanelHeight=Math.min(260,height*.34);
  const focused=useIsFocused(),[legendOpen,setLegendOpen]=useState(false);
  const data = useAppData(),family=useFamily();
  const [showFamily,setShowFamily]=useState(true);
  const [mapExpanded,setMapExpanded]=useState(false);
  useFeedInterest(tab === 'home' ? ['events','areas','zones','mapItems','weather','crisis','news','zoneNews','pressNews','community'] : tab === 'alerts' ? ['weather','crisis'] : ['events','areas','zones','mapItems','community'], tab === 'home' ? ['events'] : []);
  const { region,setRegion,position,route,setRoute,destination:initialDestination,setDestination:setInitialDestination } = data;
  useEffect(()=>{if(focused)map.current?.animateToRegion(region,0);},[focused]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const events = data.feeds.events.data as EventsResponse|null, areas = data.feeds.areas.data as AreasResponse|null, zones = data.feeds.zones.data as ZonesResponse|null, mapItems = data.feeds.mapItems.data as MapItemsResponse|null;
  const {showAreas,setShowAreas,showEvents,setShowEvents,showCommunity,setShowCommunity}=data;
  const weather = data.feeds.weather.data as FeedResponse|null, crisis = data.feeds.crisis.data as CrisisResponse|null, news = data.feeds.news.data as FeedResponse|null, zoneNews = data.feeds.zoneNews.data as FeedResponse|null;
  const communityReports = (data.feeds.community.data as CommunityPage|null)?.items || [];
  const mapCommunity=useMapCommunity(region,tab==='map'&&mapExpanded&&showCommunity);
  const loading = Object.values(data.feeds).some(entry=>entry.loading);
  const [message, setMessage] = useState("");
  const {routeFrom:from,setRouteFrom:setFrom,routeTo:to,setRouteTo:setTo,routeGps:gpsStart,setRouteGps:setGpsStart,routeMode:mode,setRouteMode:setMode}=data;
  const [routeBusy, setRouteBusy] = useState(false);
  const clock = useVisibleClock(30_000);
  const mapReady=useRef(false);
  function fitPendingRoute(){
    if(tab==='map'&&data.routeFitId)setMapExpanded(true);
    if(tab!=='map'||!mapReady.current||!map.current||!data.routeFitId||data.routeFitId!==route?.routeId)return;
    const path=route.geometry.coordinates.map(toMap);
    if(path.length>1)map.current.fitToCoordinates(path,{edgePadding:{top:110,right:35,bottom:205,left:35},animated:!reduceMotion});
    data.setRouteFitId(null);
  }
  useEffect(fitPendingRoute,[tab,data.routeFitId,route?.routeId]);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);
  function changeTab(next: Tab) {
    if (isPrototypeTab(next)) openPrototypeTab(navigation,next); else navigation.navigate(next);
    if (!reduceMotion) {
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }
  async function reload() {
    setMessage("");
    await data.refresh();
  }
  async function locate() {
    setMessage("");
    const point=await data.locate();
    if(point)map.current?.animateToRegion(neighborhoodRegion(point),reduceMotion?0:400);
    return point;
  }
  async function analyze(refresh = false) {
    setRouteBusy(true);
    setMessage("");
    try {
      let result: RouteResponse;
      if (refresh && route) result = await refreshRoute(route.routeId);
      else {
        if (!to.trim() || (!gpsStart && !from.trim()))
          throw new Error("Ange start och mål.");
        const [start, destination] = await Promise.all([
          gpsStart
            ? position&&data.positionCheckedAt&&Date.now()-data.positionCheckedAt<5*60_000
              ? Promise.resolve(position)
              : locate()
            : geocode(from).then((data) => data.results[0]),
          geocode(to).then((data) => data.results[0]),
        ]);
        if (!start || !destination)
          throw new Error(
            "Start eller mål kunde inte hittas. Prova en mer specifik svensk adress.",
          );
        result = await calculateRoute(start, destination, mode);
      }
      setRoute(result);
      const path = result.geometry.coordinates.map(toMap);
      if (path.length > 1) {
        data.setRouteFitId(result.routeId);
        changeTab("map");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Ruttanalysen kunde inte hämtas.",
      );
    } finally {
      setRouteBusy(false);
    }
  }
  const center = { latitude: region.latitude, longitude: region.longitude };
  const visibleEvents = (events?.events || [])
    .filter((event) => {
      const p = eventPoint(event);
      return p && km(center, p) < Math.max(28, region.latitudeDelta * 170);
    })
    .slice(0, 40);
  const around = position
    ? { latitude: position.lat, longitude: position.lon }
    : center;
  const nearbyAll = (events?.events || [])
    .filter((event) => {
      const p = eventPoint(event);
      return p && km(around, p) < 35;
    })
    .sort((a, b) => b.ts - a.ts);
  const nearby = nearbyAll.slice(0, 12);
  const visibleAreas = [...(areas?.features || []), ...(zones?.features || [])]
    .filter((f) => {
      const first = polygonParts(f)[0]?.coordinates[0];
      return (
        validAt(f.properties, clock) && first && km(center, first) < Math.max(60, region.latitudeDelta * 180)
      );
    })
    .slice(0, 80);
  const visibleMapItems = (mapItems?.features || []).filter((item) => {
    const [lon, lat] = item.geometry.coordinates;
    return validAt(item.properties, clock) && km(center, { latitude: lat, longitude: lon }) < Math.max(60, region.latitudeDelta * 180);
  }).slice(0, 100);
  const open = (url?: string) => {
    if (url?.startsWith("https://")) Linking.openURL(url).catch(() => {});
  };
  const chip = (label: string, active: boolean, action: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={action}
      style={[s.chip, active && s.chipOn]}
    >
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
  if(tab==='map'&&!mapExpanded)return <View style={{flex:1}}><StatusBar style="dark"/><FamilyMapScreen region={region} position={position} events={events?.events||[]} route={route} topInset={inset.top} bottomInset={inset.bottom} refreshing={data.feeds.events.loading} onRefresh={()=>void reload()} onOpenFamily={()=>changeTab('family')} onExpand={()=>setMapExpanded(true)} onLocate={()=>void locate()} openSource={open} onEditPlaces={()=>changeTab('info')}/></View>;
  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      {(['map','events','route'] as Tab[]).includes(tab) && <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        customMapStyle={tab==='map'?familyMapStyle:referenceMapStyle}
        userInterfaceStyle={tab==='map'?'light':undefined}
        onMapReady={()=>{mapReady.current=true;fitPendingRoute();}}
        onRegionChangeComplete={setRegion}
        showsUserLocation={!!position}
      >
        {showFamily&&(family.overview?.members||[]).filter(member=>member.sharing&&positionFresh(member,family.clock)).map(member=><Marker key={`family-${member.id}`} coordinate={{latitude:member.lat!,longitude:member.lon!}} title={member.display_name} description="Frivilligt delad familjeplats" pinColor={blue}/>)}
        {showFamily&&(family.overview?.zones||[]).map(zone=><Marker key={`family-zone-${zone.id}`} coordinate={{latitude:zone.lat,longitude:zone.lon}} title={zone.name} description="Familjens valda plats" tracksViewChanges={false}><PlaceLabel name={zone.name} kind={zone.kind}/></Marker>)}
        {showCommunity && <CommunityMarkers reports={mapCommunity.items} region={region} onOpen={id=>navigation.navigate('report',{id})} onZoom={next=>map.current?.animateToRegion(next,250)}/>}
        {showAreas &&
          visibleAreas.flatMap((f) =>
            polygonParts(f).map((part, i) =>
              part.coordinates.length > 2 ? (
                <Polygon
                  key={`${f.id || f.properties.name}-${i}`}
                  coordinates={part.coordinates}
                  holes={part.holes}
                  strokeColor={
                    f.properties.kind === "security-zone"
                      ? "#D86B42"
                      : f.properties.kind === "organized-crime-area" ? "#B05277" : "#675BBB"
                  }
                  fillColor={
                    f.properties.kind === "security-zone"
                      ? "rgba(216,107,66,0.16)"
                      : "rgba(103,91,187,0.12)"
                  }
                  strokeWidth={2}
                />
              ) : null,
            ),
          )}
        {showEvents&&<IncidentHeat events={destinationOnly(visibleEvents,route?.incidentsNearRoute||[])} onOpen={event=>open(event.url)}/>}
        {visibleMapItems.map((item) => (
          <Marker
            key={`admin-map-item-${item.id}`}
            coordinate={{ latitude: item.geometry.coordinates[1], longitude: item.geometry.coordinates[0] }}
            title={item.properties.title}
            description={`Cajklops-granskad kartpost · kontrollera källan. Gäller till ${new Date(item.properties.validTo).toLocaleDateString("sv-SE")}`}
            pinColor="#258A77"
            onCalloutPress={() => open(item.properties.sourceUrl)}
          />
        ))}
        {route?.incidentsNearRoute?.map(event => { const point = eventPoint(event); return point ? <Marker key={"route-" + event.id} coordinate={point} title={"Längs rutten · " + event.type} description="Ungefärlig områdespunkt" pinColor="#5634A5" onCalloutPress={() => open(event.url)}/> : null; })}
        {route?.geometry?.coordinates?.length && (
          <Polyline
            coordinates={route.geometry.coordinates.map(toMap)}
            strokeColor={blue}
            strokeWidth={5}
          />
        )}
      </MapView>}
      {(
        ["home", "alerts", "news", "family", "journey", "history", "places", "alarm", "stats", "info", "admin"] as Tab[]
      ).includes(tab) && (
        <Dashboard
          screen={
            tab as "home" | "alerts" | "news" | "family" | "journey" | "history" | "places" | "alarm" | "stats" | "info" | "admin"
          }
          topInset={inset.top}
          bottomInset={inset.bottom}
          events={events}
          areas={visibleAreas}
          allAreas={[...(areas?.features || []), ...(zones?.features || [])].filter(f => validAt(f.properties, clock))}
          policeAreaYear={areas?.year}
          mapItems={(mapItems?.features || []).filter(item => validAt(item.properties, clock))}
          region={region}
          nearby={nearby}
          statsEvents={nearbyAll}
          weather={weather}
          crisis={crisis}
          news={news}
          pressNews={data.feeds.pressNews.data as FeedResponse|null}
          zoneNews={zoneNews}
          hasLocation={!!position}
          position={position}
          locationStatus={data.locationStatus}
          locationError={data.locationError}
          eventsRefreshing={data.feeds.events.loading}
          plannedRoute={route}
          positionCheckedAt={data.positionCheckedAt}
          onOpenEvents={category=>navigation.navigate('events',{category})}
          onBack={()=>navigation.canGoBack()?navigation.goBack():navigation.popToTop()}
          onOpenStats={municipality=>navigation.dispatch(prototypeTabAction('stats',{municipality}))}
          statsMunicipality={(screenRoute.params as RootStackParams['stats'])?.municipality}
          loading={loading}
          notice={message}
          communityReports={communityReports}
          feedErrors={Object.fromEntries(Object.entries(data.feeds).map(([key,entry])=>[key,entry.error]))}
          onOpenReport={id=>navigation.navigate('report',{id})}
          onOpenNews={item=>navigation.navigate('newsDetail',{item})}
          onRefresh={reload}
          onLocate={() => {
            void locate();
          }}
          locate={locate}
          go={changeTab}
          openSource={open}
          onRouteTo={(address) => {
            setInitialDestination(address);
            data.setRouteTo(address);
            changeTab("route");
          }}
          initialDestination={initialDestination}
          onRouteResult={(result) => {
            setRoute(result);
            data.setRouteFitId(result.routeId);
            changeTab("map");
          }}
        />
      )}
      {(["map", "events", "route"] as Tab[]).includes(tab) && (
        <View style={[s.headerWrap, { top: inset.top + 10 }]}>
          <View style={s.glass}>
            <View style={s.header}>
              {tab==='map'&&<Pressable accessibilityRole="button" accessibilityLabel="Till familjeöversikten" hitSlop={10} onPress={()=>setMapExpanded(false)}><Ionicons name="chevron-back" size={22} color={ink}/></Pressable>}
              <View style={{ flex: 1 }}>
                <TryggPulseBrand nameStyle={s.brand}/>
              </View>
              <Pressable accessibilityRole="button" hitSlop={11} accessibilityLabel="Uppdatera källor" onPress={reload}>
                {loading ? (
                  <ActivityIndicator color={blue} />
                ) : (
                  <Ionicons name="refresh" size={22} color={ink} />
                )}
              </Pressable>
            </View>
          </View>
          {tab === "map" && (
            <View style={[s.chips,{flexWrap:'wrap'}]}>
              {chip("Områden", showAreas, () => setShowAreas(!showAreas))}
              {chip("Polisnotiser", showEvents, () =>
                setShowEvents(!showEvents),
              )}
              {chip('Användarrapporter',showCommunity,()=>setShowCommunity(!showCommunity))}
              {chip('Rapportera',false,()=>navigation.navigate('compose'))}
              {chip('Familj',showFamily,()=>setShowFamily(!showFamily))}
              {chip('Händelser',false,()=>navigation.navigate('events'))}
              {chip('Rutt',false,()=>navigation.navigate('route'))}
            </View>
          )}
        </View>
      )}
      {tab === "map" && (
        <Pressable
          style={[s.locate, { bottom: inset.bottom + 190 }]}
          onPress={locate}
          accessibilityLabel="Visa min plats"
        >
          <Ionicons name="locate" color={blue} size={23} />
        </Pressable>
      )}
      {(["map", "events", "route"] as Tab[]).includes(tab) && (
        <Animated.View
          style={[s.panelWrap, { bottom: inset.bottom + 77, opacity: fade }]}
        >
          <View style={s.glass}>
            {Platform.OS === "ios" && (
              <BlurView
                intensity={75}
                tint="light"
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={s.panel}>
              {tab === "map" && (
                <ScrollView style={{maxHeight:mapPanelHeight}}>
                  <Pressable style={{position:'absolute',right:0,top:0,zIndex:1}} hitSlop={12} accessibilityRole="button" accessibilityState={{expanded:legendOpen}} onPress={()=>setLegendOpen(!legendOpen)}><Text style={[s.link,{marginTop:0}]}>{legendOpen?'Dölj':'Teckenförklaring'}</Text></Pressable>
                  <Text style={s.kicker}>
                    LÄGESBILD ·{" "}
                    {events?.fetchedAt
                      ? new Date(events.fetchedAt).toLocaleTimeString("sv-SE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "HÄMTAR"}
                  </Text>
                  <Text style={s.title}>Se vad som finns runt dig</Text>
                  <Pressable style={s.routeLink} accessibilityRole="button" onPress={()=>changeTab('family')}><Ionicons name="people-outline" size={17} color={blue}/><Text style={s.link}>Familjens karta, platser och chatt</Text></Pressable>
                  <Text style={s.body}>
                    {visibleEvents.length} ungefärliga polisnotiser och{" "}
                    {visibleAreas.length} publicerade områden i kartvyn.
                  </Text>
                  {route && (
                    <Pressable
                      onPress={() => changeTab("route")}
                      style={s.routeLink}
                    >
                      <Ionicons name="navigate" size={17} color={blue} />
                      <Text style={s.link}>
                        {route.distanceKm} km · {route.durationMinutes} min · se
                        analys
                      </Text>
                    </Pressable>
                  )}
                  <Text style={s.disclaimer}>
                    Polisnotiser kan vara fördröjda. Kartpunkter är inte exakta
                    brottsplatser.
                  </Text>
                  {!!mapCommunity.error&&<Text style={s.warning}>Användarrapporter är fördröjda · {mapCommunity.error}</Text>}
                  {mapCommunity.limited&&<Text style={s.warning}>Zooma in för att visa fler användarrapporter.</Text>}
                  {legendOpen&&<MapLegend prototype/>}
                </ScrollView>
              )}
              {tab === "events" && (
                <ScrollView style={s.scroll}>
                  <Text style={s.kicker}>HÄNDELSER</Text>
                  <Text style={s.title}>
                    Nära {position ? "din plats" : "kartans mitt"}
                  </Text>
                  <Text style={s.body}>
                    Publicerade polisnotiser inom cirka 35 km. Tryck för
                    originalkällan.
                  </Text>
                  {nearby.length ? (
                    nearby.map((e) => (
                      <Pressable
                        key={e.id}
                        style={s.item}
                        onPress={() => open(e.url)}
                      >
                        <Text style={s.itemTitle}>
                          {e.type} · {e.name} ↗
                        </Text>
                        <Text style={s.body} numberOfLines={2}>
                          {e.summary}
                        </Text>
                        <Text style={s.meta}>
                          {e.location?.name || "Område"} ·{" "}
                          {new Date(e.ts).toLocaleString("sv-SE")}
                        </Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={s.empty}>
                      Inga notiser matchar området i tillgängliga data. Det är
                      ingen garanti för säkerhet.
                    </Text>
                  )}
                </ScrollView>
              )}
              {tab === "route" && (
                <ScrollView
                  style={[s.scroll,{maxHeight:Math.min(330,Math.max(150,height-inset.top-inset.bottom-210))}]}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={s.kicker}>RUTTANALYS</Text>
                  <Text style={s.title}>Planera din väg</Text>
                  <Text style={s.body}>
                    Se zoner och ungefärliga polisnotiser längs en svensk rutt.
                  </Text>
                  <Text style={s.label}>FRÅN</Text>
                  <TextInput
                    value={from}
                    onChangeText={setFrom}
                    editable={!gpsStart}
                    style={s.input}
                    placeholder="Startadress"
                  />
                  {chip("Använd min plats", gpsStart, () =>
                    setGpsStart(!gpsStart),
                  )}
                  <Text style={s.label}>TILL</Text>
                  <TextInput
                    value={to}
                    onChangeText={setTo}
                    style={s.input}
                    placeholder="Destination"
                  />
                  <View style={s.chips}>
                    {chip("Gång", mode === "walking", () => setMode("walking"))}
                    {chip("Bil", mode === "driving", () => setMode("driving"))}
                  </View>
                  <Pressable
                    style={s.primary}
                    disabled={routeBusy}
                    onPress={() => analyze()}
                  >
                    <Text style={s.primaryText}>
                      {routeBusy ? "Analyserar…" : "Analysera rutt →"}
                    </Text>
                  </Pressable>
                  {route && (
                    <View style={s.results}>
                      <Text style={s.title}>
                        {route.distanceKm} km · {route.durationMinutes} min
                      </Text>
                      <Pressable
                        onPress={() => analyze(true)}
                        disabled={routeBusy}
                      >
                        <Text style={s.link}>Uppdatera källor ↻</Text>
                      </Pressable>
                      <Text style={s.meta}>
                        {route.policeAreaPassages?.length || 0} polisområden ·{" "}
                        {route.securityZonePassages?.length || 0} säkerhetszoner
                        · {route.networkAreaPassages?.length || 0}{" "}
                        nätverksområden · {route.incidentsCount} områdesnotiser
                      </Text>
                      {[
                        ...(route.securityZonePassages || []),
                        ...(route.networkAreaPassages || []),
                        ...(route.policeAreaPassages || []),
                      ]
                        .sort((a, b) => a.startMeters - b.startMeters)
                        .map((p) => (
                          <Pressable
                            key={p.id}
                            style={s.item}
                            onPress={() => open(p.sourceUrl)}
                          >
                            <Text style={s.itemTitle}>
                              {p.category} · {p.name}
                            </Text>
                            <Text style={s.meta}>
                              {(p.startMeters / 1000).toFixed(1)}–
                              {(p.endMeters / 1000).toFixed(1)} km längs rutten{" "}
                              {p.stale ? "· äldre underlag" : ""}
                            </Text>
                            {p.sourceTitle && (
                              <Text style={s.link}>{p.sourceTitle} ↗</Text>
                            )}
                          </Pressable>
                        ))}
                      {route.incidentsNearRoute?.slice(0, 8).map((e) => (
                        <Pressable
                          key={e.id}
                          style={s.item}
                          onPress={() => open(e.url)}
                        >
                          <Text style={s.itemTitle}>
                            {e.type} · {e.name}
                          </Text>
                          <Text style={s.meta}>
                            Ungefärligt område ·{" "}
                            {new Date(e.ts).toLocaleString("sv-SE")}
                          </Text>
                        </Pressable>
                      ))}
                      <Source
                        label="Polisens områden"
                        status={route.sourceStatus?.["polisen-areas"]?.status}
                      />
                      <Source
                        label="Granskade zoner"
                        status={route.sourceStatus?.["reviewed-zones"]?.status}
                      />
                      <Source
                        label="Polisnotiser"
                        status={route.sourceStatus?.["polisen-events"]?.status}
                      />
                      <Text style={s.disclaimer}>
                        En tom träfflista betyder bara att tillgängligt underlag
                        saknar matchningar.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}
              {!!message && <Text style={s.warning}>{message}</Text>}
            </View>
          </View>
        </Animated.View>
      )}
      {!isPrototypeTab(tab)&&<PrototypeTabs/>}
    </View>
  );
}
export default function App() {
  const [fontsLoaded,fontError]=useFonts(interfaceFonts);
  const [reduce,setReduce] = useState(false);
  const pendingLink = useRef<()=>void>(()=>{});
  useEffect(()=>{
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const motion=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduce);
    const dispatch=(navigate:()=>void)=>{if(navigationRef.isReady())navigate();else pendingLink.current=navigate;};
    const open=(url:string)=>{try{const parsed=new URL(url),trusted=parsed.protocol===`${Constants.expoConfig?.scheme||'tryggpuls'}:`||(parsed.protocol==='https:'&&parsed.host===(Constants.expoConfig?.extra?.appLinkHost||new URL(API_BASE).host));if(!trusted)return;const params=new URLSearchParams(parsed.hash.slice(1)||parsed.search.slice(1)),action=params.get('action'),token=params.get('token');if(['verify','reset'].includes(action||'')&&token&&/^[A-Za-z0-9_-]{43}$/.test(token))dispatch(()=>navigationRef.navigate('account',{action:action as 'verify'|'reset',token}));}catch{}};
    void Linking.getInitialURL().then(url=>{if(url)open(url);});
    const links=Linking.addEventListener('url',event=>open(event.url));
    const respond=(response:Notifications.NotificationResponse|null)=>{const payload=response?.notification.request.content.data;if(!payload)return;if(payload.screen==='alarm')dispatch(()=>navigationRef.navigate('alarm'));else if(payload.screen==='report'&&typeof payload.reportId==='string'&&/^[a-f0-9-]{36}$/i.test(payload.reportId)){const id=payload.reportId;dispatch(()=>navigationRef.navigate('report',{id}));}};
    const responses=Notifications.addNotificationResponseReceivedListener(respond);
    void Notifications.getLastNotificationResponseAsync().then(respond).catch(()=>{});
    return()=>{motion.remove();links.remove();responses.remove();};
  },[]);
  if(!fontsLoaded&&!fontError)return <View style={{flex:1,backgroundColor:'#FAFBFE',alignItems:'center',justifyContent:'center'}}><ActivityIndicator color="#2187F5"/></View>;
  return (
    <SafeAreaProvider>
      <FamilyProvider><AppDataProvider><NavigationContainer ref={navigationRef} onReady={()=>pendingLink.current()}>
        <Stack.Navigator screenOptions={{headerBackButtonDisplayMode:'minimal',headerStyle:{backgroundColor:'#FAFBFE'},headerTintColor:blue,contentStyle:{backgroundColor:'#FAFBFE'},animation:reduce?'none':'slide_from_right'}}>
          <Stack.Screen name="main" component={PrototypeMain} getId={()=>'prototype-main'} options={{headerShown:false}}/>
          {(['alerts','family','journey','history','alarm','stats','admin'] as const).map(name=><Stack.Screen key={name} name={name} component={AppScreen} getId={()=>name} options={{headerShown:false}}/>)}
          <Stack.Screen name="events" component={EventsScreen} options={{headerShown:false}}/>
          <Stack.Screen name="route" component={AppScreen} options={{headerShown:false}}/>
          <Stack.Screen name="news" component={NewsScreen} getId={()=>'news'} options={{headerShown:false}}/>
          <Stack.Screen name="newsDetail" component={FramedNewsDetail} options={{headerShown:false}}/>
          <Stack.Screen name="community" component={FramedCommunity} options={{headerShown:false}}/>
          <Stack.Screen name="compose" component={FramedCompose} options={{headerShown:false}}/>
          <Stack.Screen name="report" component={FramedReport} options={{headerShown:false}}/>
          <Stack.Screen name="account" component={FramedAccount} options={{headerShown:false}}/>
          <Stack.Screen name="policy" component={FramedPolicy} options={{headerShown:false}}/>
          <Stack.Screen name="blocks" component={FramedBlocks} options={{headerShown:false}}/>
        </Stack.Navigator>
      </NavigationContainer><AlarmCoordinator/></AppDataProvider></FamilyProvider>
    </SafeAreaProvider>
  );
}
