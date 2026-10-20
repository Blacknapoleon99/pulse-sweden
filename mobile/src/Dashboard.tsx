import { Text } from './Typography';
import { useEffect, useRef,useState } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Linking, RefreshControl, KeyboardAvoidingView, Platform, ScrollView, View, Pressable, useWindowDimensions } from 'react-native';
import type { Region } from "react-native-maps";
import type {
  Bulletin,
  CrisisResponse,
  Event,
  EventsResponse,
  Feature,
  FeedResponse,
  MapItem,
  Point,
  RouteResponse,
} from "./api";
import { FamilyScreen } from "./FamilyScreen";
import {prototypeDashboardStyles as styles} from "./PrototypeDashboardStyles";
import { StatsScreen } from "./StatsScreen";
import { ProfileScreen } from "./ProfileScreen";
import { AdminMapItemsScreen } from "./AdminMapItemsScreen";
import { FamilyAlarmScreen } from "./FamilyAlarmScreen";
import { PlaceHistoryScreen } from "./PlaceHistoryScreen";
import { RouteExploreScreen } from "./RouteExploreScreen";
import { AppHeader, IncidentTiles, NewsTile, SearchBar, SectionHeader } from './ReferenceKit';
import { Freshness, SourceDisclosure } from './UI';
import {newsSource,stableNews} from './newsState';
import {OverviewMap} from './OverviewMap';
import {FamilyStrip} from './FamilyStrip';
import {colors} from './theme';
import type { CommunityReport } from './communityApi';
import { latestNearbyEvents, neighborhoodRegion, recentHomeEvents } from './homeMapState';

export type DashboardScreen =
  | "home"
  | "alerts"
  | "news"
  | "family"
  | "journey"
  | "history"
  | "places"
  | "alarm"
  | "stats"
  | "info"
  | "admin";
export type Destination = DashboardScreen | "map" | "events" | "route" | "info" | "admin" | 'community' | 'compose' | 'account';

type Props = {
  screen: DashboardScreen;
  topInset: number;
  bottomInset: number;
  events: EventsResponse | null;
  areas: Feature[];
  allAreas: Feature[];
  policeAreaYear?: number;
  mapItems: MapItem[];
  region: Region;
  nearby: Event[];
  statsEvents: Event[];
  weather: FeedResponse | null;
  crisis: CrisisResponse | null;
  news: FeedResponse | null;
  zoneNews: FeedResponse | null;
  pressNews?: FeedResponse | null;
  hasLocation: boolean;
  position?: Point|null;
  locationError?: string;
  eventsRefreshing:boolean;
  plannedRoute?:RouteResponse|null;
  locationStatus:'unknown'|'loading'|'granted'|'denied'|'error';
  positionCheckedAt:number|null;
  loading: boolean;
  notice?: string;
  onRefresh: () => void;
  onLocate: () => void;
  locate: () => Promise<Point | null>;
  go: (screen: Destination) => void;
  openSource: (url?: string) => void;
  onRouteTo: (address: string) => void;
  initialDestination: string;
  onRouteResult: (route: RouteResponse) => void;
  communityReports: CommunityReport[];
  feedErrors: Record<string,string|null>;
  onOpenReport: (id:string)=>void;
  onOpenNews: (item:Bulletin)=>void;
  onOpenEvents: (category:'robbery'|'violence'|'traffic-accident')=>void;
  onBack:()=>void;
  onOpenStats:(municipality?:string)=>void;
  statsMunicipality?:string;
};

const navy = "#11152A";
const blue = "#2187F5";
const muted = "#72788D";

function time(value?: number | string) {
  if (!value) return "Tid ej angiven";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Tid ej angiven"
    : parsed.toLocaleString("sv-SE", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function ActionTile({
  icon,
  label,
  detail,
  tint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  tint: string;
  onPress: () => void;
}) {
  const {fontScale}=useWindowDimensions();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.actionTile, fontScale>1.3&&{flexBasis:'45%',flexShrink:0}, pressed && styles.pressed]}
    >
      <View style={[styles.tileIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={22} color={navy} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileDetail} numberOfLines={fontScale>1.3?undefined:2}>
        {detail}
      </Text>
    </Pressable>
  );
}

function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <SectionHeader title={title} action={action} onPress={action ? onPress : undefined}/>
  );
}

export function BulletinCard({
  item,
  label,
  tone,
  onPress,
}: {
  item: Bulletin;
  label: string;
  tone: "red" | "amber" | "blue";
  onPress: () => void;
}) {
  const color =
    tone === "red" ? "#D34D5B" : tone === "amber" ? "#D78A36" : blue;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.bulletin, pressed && styles.pressed]}
    >
      <View style={[styles.bulletinRule, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.eyebrow, { color }]}>{label}</Text>
        <Text style={styles.bulletinTitle}>{item.title}</Text>
        {item.summary ? (
          <Text style={styles.body} numberOfLines={3}>
            {item.summary}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {item.area ? `${item.area} · ` : ""}
          {time(item.publishedAt)}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={muted} />
    </Pressable>
  );
}

export function Dashboard(props: Props) {
  const [mapTouch,setMapTouch]=useState(false);
  const {fontScale,height:useHeight} = useWindowDimensions();
  const {
    screen,
    topInset,
    bottomInset,
    events,
    areas,
    allAreas,
    policeAreaYear,
    mapItems,
    region,
    nearby,
    statsEvents,
    weather,
    crisis,
    news,
    zoneNews,
    hasLocation,
    loading,
    notice,
    onRefresh,
    onLocate,
    locate,
    go,
    openSource,
    onRouteTo,
    initialDestination,
    onRouteResult,
  } = props;
  const urgent = crisis?.vmas || [];
  const notices = crisis?.notices || [];
  const weatherItems = weather?.items || [];
  const newsItems = stableNews([...(props.pressNews?.items || []), ...(news?.items || []), ...(zoneNews?.items || [])]);
  const leadNews = newsItems.find(item=>item.imageUrl)||newsItems[0];
  const homeNews = leadNews ? [leadNews,...newsItems.filter(item=>item.id!==leadNews.id)].slice(0,6) : [];
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({y:0,animated:false}); }, [screen]);
  const isHome = screen === "home";
  const [search,setSearch]=useState("");
  const [placeOpen,setPlaceOpen]=useState(false);
  const origin=props.position||null;
  const homeRegion=origin?neighborhoodRegion(origin):region;
  const homeMapEvents=recentHomeEvents(statsEvents);
  const homeEvents=latestNearbyEvents(homeMapEvents,origin||{lat:region.latitude,lon:region.longitude},35,homeMapEvents.length);
  const locating=props.locationStatus==='loading';
  return (
    <KeyboardAvoidingView style={[styles.page,isHome&&{backgroundColor:'#EDF3FA'}]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        scrollEnabled={!mapTouch}
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + (isHome ? 6 : 16), paddingBottom: bottomInset + 104 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor={blue}
          />
        }
      >
        {!(placeOpen&&(screen==="places"||screen==="history"))&&<AppHeader
          onBack={isHome||["family","stats","places","info"].includes(screen)?undefined:props.onBack}
          onBrand={isHome?undefined:()=>go("home")}
          right={screen==="stats"?"notifications-outline":screen==="family"?"settings-outline":undefined}
          rightLabel={screen==="stats"?"Varningar och meddelanden":"Konto och inställningar"}
          onRight={screen==="stats"?()=>go("alerts"):()=>go("account")}
        />}

        {isHome ? (
          <>
            <SearchBar reference value={search} onChangeText={setSearch} placeholder="Vart vill du gå?" onSubmit={()=>{if(search.trim())onRouteTo(search.trim());}} onFilter={()=>go('map')} filterLabel="Öppna karta och filter"/>
            <FamilyStrip onOpen={()=>go('family')} onAlarm={()=>go('alarm')}/>
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            <View style={{marginHorizontal:-14}}><OverviewMap region={homeRegion} events={homeMapEvents} position={origin} route={props.plannedRoute} onOpenEvent={event=>openSource(event.url)} onOpenPlace={onRouteTo} onEditPlaces={()=>go('info')} onLocate={onLocate} onInteraction={setMapTouch} height={Math.round(Math.min(280,Math.max(220,useHeight*.31)))}/></View>
            {!origin&&<Pressable accessibilityRole="button" accessibilityState={{disabled:locating,busy:locating}} disabled={locating} onPress={()=>{if(props.locationStatus==='denied')void Linking.openSettings().catch(()=>{});else onLocate();}} style={{flexDirection:'row',alignItems:'center',gap:8,minHeight:44,paddingHorizontal:10,backgroundColor:colors.secondary,borderRadius:7,marginTop:6}}>
              {locating?<ActivityIndicator size="small" color={blue}/>:<Ionicons name="navigate" size={16} color={blue}/>}
              <View style={{flex:1}}><Text style={{fontSize:12,fontWeight:'600',color:blue}}>{locating?'Hittar din plats…':props.locationStatus==='denied'?'Tillåt platsåtkomst i inställningarna':props.locationStatus==='error'?'Försök hitta min plats igen':'Visa händelser nära mig'}</Text>
              <Text style={{fontSize:10,color:muted,marginTop:2}}>{props.locationError||'Kartan visar vald plats tills du tillåter platsåtkomst.'}</Text></View>
              {!locating&&<Ionicons name="chevron-forward" size={14} color={blue}/>}
            </Pressable>}
            <View style={{backgroundColor:'#EDF3FA',borderTopLeftRadius:16,borderTopRightRadius:16,marginTop:origin?-10:0,paddingHorizontal:14,paddingTop:1,marginHorizontal:-14}}>
            <SectionHeader title={origin?'Händelser nära dig':'Händelser kring kartan'} onPress={()=>go('events')}/>
            <IncidentTiles reference events={homeEvents} origin={origin} onOpen={event=>openSource(event.url)} onOpenCategory={category=>props.onOpenEvents(category==='traffic'?'traffic-accident':category)} empty={events?`Inga publicerade polisnotiser inom 35 km från ${origin?'din plats':'kartans mitt'} de senaste sju dagarna i hämtade data.`:props.feedErrors.events?'Polisens händelser kunde inte hämtas just nu.':'Hämtar händelser…'}/>
            {!!props.feedErrors.events&&<Freshness fetchedAt={events?.fetchedAt} error={props.feedErrors.events} refreshing={props.eventsRefreshing}/>}
            <SectionHeader title="Nyheter" onPress={()=>go('news')}/>
            {!!homeNews.length&&<ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={262} snapToAlignment="start" style={{marginHorizontal:-14}} contentContainerStyle={{gap:12,paddingHorizontal:14,paddingBottom:6}}>{homeNews.map(item=><NewsTile key={item.id||item.title} item={item} source={newsSource(item)} onPress={()=>props.onOpenNews(item)}/>)}</ScrollView>}
            {!newsItems.length&&<Text style={styles.empty}>{news||zoneNews||props.pressNews?'Inga nya artiklar i hämtade flöden.':props.feedErrors.news||props.feedErrors.zoneNews||props.feedErrors.pressNews?'Nyheterna kunde inte hämtas just nu.':'Hämtar nyheter…'}</Text>}
            {!!props.feedErrors.pressNews&&<Freshness fetchedAt={props.pressNews?.fetchedAt} error={props.feedErrors.pressNews}/>}
            <SourceDisclosure summary="Om kartan och källorna">
            <Freshness fetchedAt={events?.fetchedAt} error={props.feedErrors.events} refreshing={props.eventsRefreshing}/>
            <Freshness fetchedAt={props.pressNews?.fetchedAt} error={props.feedErrors.pressNews}/>
            <Text style={styles.finePrint}>Kartpunkter är ungefärliga. Rött och gult markerar polisnotiser; grönt visar familjens valda platser. Färgerna bedömer inte områdets trygghet. Myndighetsuppgifter kan vara fördröjda.</Text>
            </SourceDisclosure>
            </View>
          </>
        ) : (
          <>
            {screen === "alerts" && (
              <>
                <Text style={styles.eyebrow}>MYNDIGHETSFLÖDEN</Text>
                <Text style={styles.heading}>Varningar och meddelanden</Text>
                <Text style={styles.intro}>
                  VMA, Krisinformation och SMHI för hela Sverige. Kontrollera
                  alltid berört område och giltighet i originalkällan.
                </Text>
                <Freshness fetchedAt={crisis?.fetchedAt} error={props.feedErrors.crisis}/><Freshness fetchedAt={weather?.fetchedAt} error={props.feedErrors.weather}/>
                <SectionTitle
                  title={`VMA ${urgent.length ? `· ${urgent.length}` : ""}`}
                />
                {urgent.length ? (
                  urgent.map((item, i) => (
                    <BulletinCard
                      key={item.id || i}
                      item={item}
                      label="VIKTIGT MEDDELANDE"
                      tone="red"
                      onPress={() => openSource(item.source)}
                    />
                  ))
                ) : (
                  <Text style={styles.empty}>
                    {crisis
                      ? "Inga VMA i hämtade data."
                      : "VMA-flödet är inte tillgängligt."}
                  </Text>
                )}
                <SectionTitle title="Övriga meddelanden" />
                {notices.length ? (
                  notices.map((item, i) => (
                    <BulletinCard
                      key={item.id || i}
                      item={item}
                      label="KRISINFORMATION"
                      tone="blue"
                      onPress={() => openSource(item.source)}
                    />
                  ))
                ) : (
                  <Text style={styles.empty}>
                    {crisis
                      ? "Inga meddelanden i hämtade data."
                      : "Flödet är inte tillgängligt."}
                  </Text>
                )}
                <SectionTitle title="Vädervarningar" />
                {weatherItems.length ? (
                  weatherItems
                    .slice(0, 20)
                    .map((item, i) => (
                      <BulletinCard
                        key={item.id || i}
                        item={item}
                        label={`SMHI · ${item.levelLabel || "VARNING"}`}
                        tone="amber"
                        onPress={() => openSource(item.source)}
                      />
                    ))
                ) : (
                  <Text style={styles.empty}>
                    {weather
                      ? "Inga vädervarningar i hämtade data."
                      : "SMHI-flödet är inte tillgängligt."}
                  </Text>
                )}
              </>
            )}
            {screen === "news" && (
              <>
                <Text style={styles.eyebrow}>VIKTIGA NYHETER</Text>
                <Text style={styles.heading}>Senaste uppdateringarna</Text>
                <Text style={styles.intro}>
                  Nyheter från Aftonbladet, Expressen, Krisinformation och
                  Polisen. Läs hela artikeln hos källan.
                </Text>
                {newsItems.length ? (
                  newsItems
                    .slice(0, 20)
                    .map((item, i) => (
                      <BulletinCard
                        key={item.id || `${item.title}-${i}`}
                        item={item}
                        label={newsSource(item)}
                        tone="blue"
                        onPress={() => openSource(item.url || item.source)}
                      />
                    ))
                ) : (
                  <Text style={styles.empty}>
                    {news || zoneNews
                      ? "Inga nya artiklar i de hämtade flödena."
                      : "Nyhetsflödena kunde inte hämtas just nu."}
                  </Text>
                )}
              </>
            )}
            {screen === "family" && (
              <FamilyScreen
                nearby={events?.events || []}
                openSource={openSource}
              />
            )}
            {screen === "journey" && <RouteExploreScreen events={events} areas={allAreas} items={mapItems} initialTo={initialDestination} locate={locate} openSource={openSource} onExpand={onRouteResult} />}
            {(screen === "history"||screen === "places") && <PlaceHistoryScreen events={events} areas={allAreas} policeAreaYear={policeAreaYear} items={mapItems} openSource={openSource} onOpenStats={props.onOpenStats} onEditPlaces={()=>go("info")} onDetailChange={setPlaceOpen} />}
            {screen === "alarm" && <FamilyAlarmScreen onOpenFamily={() => go("family")} />}
            {screen === "stats" && (
              <StatsScreen initialMunicipality={props.statsMunicipality} nearby={statsEvents} areas={areas} eventsResponse={events} centerLabel={hasLocation?"din plats":"kartans mitt"} />
            )}
            {screen === "info" && (
              <>
                <ProfileScreen onRouteTo={onRouteTo} onOpenAdmin={() => go("admin")} />
                <SectionTitle title="Datakällor" />
                <Text style={styles.body}>
                  Polisnotiser, BRÅ, SMHI och Krisinformation hämtas från
                  Cajklops server. Publicerade uppgifter kan vara fördröjda och
                  kartpunkter ungefärliga.
                </Text>
                <SectionTitle title="Fler funktioner"/>
                <View style={[styles.actions,fontScale>1.3&&{flexWrap:"wrap"}]}><ActionTile icon="person-outline" label="Mitt konto" detail="E-post och aviseringar" tint="#E7EFF9" onPress={()=>go('account')}/><ActionTile icon="chatbubbles-outline" label="Rapporter" detail="Obekräftade observationer" tint="#E9E9FF" onPress={()=>go('community')}/><ActionTile icon="notifications-outline" label="Familjelarm" detail="Be familjen om hjälp" tint="#FFE9E1" onPress={()=>go('alarm')}/></View>
                <View style={[styles.actions,fontScale>1.3&&{flexWrap:"wrap"}]}><ActionTile icon="navigate-outline" label="Utforska rutt" detail="Notiser och service" tint="#E7EFF9" onPress={()=>go('journey')}/><ActionTile icon="time-outline" label="Platshistorik" detail="Plats och statistik" tint="#E2F3F0" onPress={()=>go('history')}/><ActionTile icon="add-circle-outline" label="Rapportera" detail="Publicera en observation" tint="#E9E9FF" onPress={()=>go('compose')}/></View>
              </>
            )}
            {screen === "admin" && (
              <AdminMapItemsScreen onBack={() => go("info")} onPublished={onRefresh} />
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
