import { Text, TextInput } from './Typography';
import { useState, type ReactNode } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Circle } from "react-native-maps";
import type { Bulletin, Event, Point } from "./api";
import { TryggPulseBrand } from "./CajklopsBrand";
import { categoryOf, incidentCategories } from "./incidentSummary";
import { eventPoint } from "./mobileState";
import { colors, shadow } from "./theme";
import {MapLabelMarker} from './MapLabelMarker';
import {flareColor} from './MapFlares';

type IconName = keyof typeof Ionicons.glyphMap;
const heatRings=[{radius:420,alpha:'08'},{radius:350,alpha:'0A'},{radius:280,alpha:'10'},{radius:210,alpha:'16'},{radius:145,alpha:'22'},{radius:85,alpha:'30'}];

// Shared building blocks for the Trygg-Puls reference screens. Every page uses
// the same centred shield header, search field, tabs, tiles and map labels.

export function AppHeader({
  onBack,
  right,
  rightLabel,
  onRight,
  title,
  subtitle,
  trailing,
  onBrand,
}: {
  onBack?: () => void;
  right?: IconName;
  rightLabel?: string;
  onRight?: () => void;
  title?: string;
  subtitle?: string;
  trailing?: ReactNode;
  onBrand?: () => void;
}) {
  return (
    <View style={s.header}>
      <View style={s.headerSide}>
        {onBack && (
          <Pressable
            hitSlop={10}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Tillbaka"
            style={s.headerButton}
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
        )}
      </View>
      <Pressable
        style={s.headerCenter}
        disabled={!onBrand}
        onPress={onBrand}
        accessibilityRole={onBrand ? "button" : "header"}
        accessibilityLabel={title || "Till startsidan"}
      >
        {title ? (
          <>
            <Text style={s.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={s.headerSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </>
        ) : (
          <TryggPulseBrand />
        )}
      </Pressable>
      <View style={[s.headerSide, { alignItems: "flex-end" }]}>
        {trailing ||
          (right && onRight && (
            <Pressable
              hitSlop={10}
              onPress={onRight}
              accessibilityRole="button"
              accessibilityLabel={rightLabel}
              style={s.headerButton}
            >
              <Ionicons name={right} size={22} color={colors.ink} />
            </Pressable>
          ))}
      </View>
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  onFilter,
  filterLabel = "Filter",
  busy,
  reference = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  onFilter?: () => void;
  filterLabel?: string;
  busy?: boolean;
  reference?: boolean;
}) {
  return (
    <View style={reference?s.referenceSearchRow:undefined}>
    <View style={[s.search,reference&&s.referenceSearch]}>
      <Ionicons name="search-outline" size={19} color={colors.ink} />
      <TextInput
        style={s.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#56657D"
        accessibilityLabel={placeholder}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />
      {busy && <Text style={s.searchBusy}>…</Text>}
      {onFilter && !reference && (
        <Pressable
          style={s.searchFilter}
          onPress={onFilter}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={filterLabel}
        >
          <Ionicons name="options-outline" size={20} color={colors.ink} />
        </Pressable>
      )}
    </View>
    {onFilter&&reference&&<Pressable style={s.referenceFilter} onPress={onFilter} accessibilityRole="button" accessibilityLabel={filterLabel}><Ionicons name="options-outline" size={21} color={colors.ink}/></Pressable>}
    </View>
  );
}

export function SectionHeader({
  title,
  action = "Visa alla",
  onPress,
  right,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {right ||
        (onPress && (
          <Pressable
            hitSlop={12}
            onPress={onPress}
            accessibilityRole="button"
            style={s.sectionAction}
          >
            <Text style={s.sectionLink}>{action}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.link} />
          </Pressable>
        ))}
    </View>
  );
}

export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={s.underline}>
      {items.map((item) => {
        const on = item.id === value;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.underlineTab, on && s.underlineTabOn]}
          >
            <Text style={[s.underlineText, on && s.underlineTextOn]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DropdownPill({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={s.dropdown}
      hitSlop={8}
    >
      <Text style={s.dropdownText}>{label}</Text>
      <Ionicons name="chevron-down" size={13} color={colors.blue} />
    </Pressable>
  );
}

export function relativeTime(value?: number | string, now = Date.now()) {
  const ts = typeof value === "string" ? Date.parse(value) : value;
  if (!ts || !Number.isFinite(ts)) return "Tid ej angiven";
  const minutes = Math.max(0, Math.round((now - ts) / 60_000));
  if (minutes < 1) return "Nyss";
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 dag sedan" : `${days} dagar sedan`;
}

export function distanceLabel(event: Event, origin?: Point | null) {
  const point = eventPoint(event);
  if (!origin || !point) return "";
  const rad = Math.PI / 180,
    dLat = (point.latitude - origin.lat) * rad,
    dLon = (point.longitude - origin.lon) * rad;
  const km =
    12742 *
    Math.asin(
      Math.sqrt(
        Math.sin(dLat / 2) ** 2 +
          Math.cos(origin.lat * rad) *
            Math.cos(point.latitude * rad) *
            Math.sin(dLon / 2) ** 2,
      ),
    );
  return km < 1
    ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
    : `${km.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km`;
}

export function IncidentTile({
  event,
  origin,
  onPress,
  reference = false,
}: {
  event: Event;
  origin?: Point | null;
  onPress: () => void;
  reference?: boolean;
}) {
  const category = categoryOf(event.type),
    place = event.location?.name || event.name || "Område",
    distance = distanceLabel(event, origin);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.type}, ${place}, ${relativeTime(event.ts)}`}
      style={({ pressed }) => [s.tile, reference&&s.referenceTile,reference&&{backgroundColor:`${category.color}06`}, pressed && s.pressed]}
    >
      <View style={[s.tileTop,reference&&s.referenceTileTop]}>
        <View
          style={[s.tileIcon, { backgroundColor: `${category.color}1F` },reference&&{width:30,height:30,borderRadius:15,backgroundColor:category.id==='robbery'?category.color:'transparent'}]}
        >
          {reference?<ReferenceIncidentIcon category={category.id} color={category.color}/>:<Ionicons
            name={category.icon as IconName}
            size={reference?26:16}
            color={reference&&category.id==='robbery'?'#fff':category.color}
          />}
        </View>
        <Text style={[s.tileTitle,reference&&s.referenceTileTitle]} numberOfLines={1}>
          {category.id === "other" ? event.type || "Händelse" : category.label}
        </Text>
      </View>
      <Text style={[s.tileTime,reference&&s.referenceTileTime]}>{relativeTime(event.ts)}</Text>
      <Text style={[s.tilePlace,reference&&s.referenceTilePlace]} numberOfLines={1}>
        {place}
        {distance ? `, ${distance}` : ""}
      </Text>
    </Pressable>
  );
}

function ReferenceIncidentIcon({category,color}:{category:string;color:string}){
  if(category==='robbery')return <FontAwesome6 name="user-ninja" iconStyle="solid" size={20} color="#fff"/>;
  if(category==='violence')return <FontAwesome6 name="hand-fist" iconStyle="solid" size={25} color="#975700"/>;
  if(category==='traffic')return <Ionicons name="car" size={27} color={color}/>;
  return <Ionicons name="alert-circle" size={25} color={color}/>;
}

export function IncidentTiles({
  events,
  origin,
  onOpen,
  empty,
  reference = false,
  onOpenCategory,
}: {
  events: Event[];
  origin?: Point | null;
  onOpen: (event: Event) => void;
  empty: string;
  reference?: boolean;
  onOpenCategory?: (category:'robbery'|'violence'|'traffic')=>void;
}) {
  if(reference)return <>
    <View style={s.tiles}>{incidentCategories.slice(0,3).map(category=>{
      const event=events.find(event=>category.id==='traffic'?/trafikolycka|kollision/i.test(event.type):categoryOf(event.type).id===category.id);
      const open=()=>onOpenCategory?.(category.id as 'robbery'|'violence'|'traffic');
      if(event)return <IncidentTile key={category.id} reference event={event} origin={origin} onPress={onOpenCategory?open:()=>onOpen(event)}/>;
      return <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`${category.label}, ingen hämtad notis`} onPress={open} style={[s.tile,s.referenceTile,{backgroundColor:`${category.color}06`}]}>
        <View style={[s.tileTop,s.referenceTileTop]}><View style={[s.tileIcon,{width:30,height:30,borderRadius:15,backgroundColor:category.id==='robbery'?category.color:'transparent'}]}><ReferenceIncidentIcon category={category.id} color={category.color}/></View><Text style={[s.tileTitle,s.referenceTileTitle]} numberOfLines={1}>{category.label}</Text></View>
        <Text style={[s.tileTime,s.referenceTileTime]}>—</Text><Text style={[s.tilePlace,s.referenceTilePlace]}>Ingen hämtad notis</Text>
      </Pressable>;
    })}</View>
    {!events.length&&<Text style={{fontSize:11,lineHeight:16,color:colors.muted,marginTop:6}}>{empty}</Text>}
  </>;
  if (!events.length) return <Text style={s.empty}>{empty}</Text>;
  return (
    <View style={s.tiles}>
      {events.slice(0, 3).map((event) => (
        <IncidentTile
          key={event.id}
          event={event}
          origin={origin}
          reference={reference}
          onPress={() => onOpen(event)}
        />
      ))}
    </View>
  );
}

export function NewsCard({
  item,
  source,
  onPress,
}: {
  item: Bulletin;
  source: string;
  onPress: () => void;
}) {
  const [failedUrl,setFailedUrl]=useState<string|null>(null);
  const imageUrl=item.imageUrl?.startsWith('https://')&&failedUrl!==item.imageUrl?item.imageUrl:null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${source}. Öppna förhandsvisning`}
      style={({ pressed }) => [s.news, pressed && s.pressed]}
    >
      <View style={s.newsThumb}>
        {imageUrl?<Image source={{uri:imageUrl}} accessibilityLabel={`Artikelbild från ${source}`} style={StyleSheet.absoluteFill} resizeMode="cover" onError={()=>setFailedUrl(imageUrl)}/>:<Ionicons name="newspaper-outline" size={26} color={colors.blue} />}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.newsSource} numberOfLines={1}>{source}</Text>
        <Text style={s.newsTitle} numberOfLines={3}>
          {item.title}
        </Text>
        <Text style={s.newsMeta} numberOfLines={1}>
          {relativeTime(item.publishedAt)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

export function NewsTile({item,source,onPress}:{item:Bulletin;source:string;onPress:()=>void}){
  const [failedUrl,setFailedUrl]=useState<string|null>(null);
  const imageUrl=item.imageUrl?.startsWith('https://')&&failedUrl!==item.imageUrl?item.imageUrl:null;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}. ${source}. Öppna förhandsvisning`} style={({pressed})=>[{width:250,backgroundColor:colors.surface,borderRadius:14,borderWidth:1,borderColor:colors.border,overflow:'hidden'},pressed&&s.pressed]}>
    <View style={{height:120,backgroundColor:colors.secondary,alignItems:'center',justifyContent:'center'}}>
      {imageUrl?<Image source={{uri:imageUrl}} accessibilityLabel={`Artikelbild från ${source}`} style={StyleSheet.absoluteFill} resizeMode="cover" onError={()=>setFailedUrl(imageUrl)}/>:<Ionicons name="newspaper-outline" size={32} color={colors.blue}/>}
    </View>
    <View style={{padding:10,gap:3}}>
      <Text style={s.newsSource} numberOfLines={1}>{source}</Text>
      <Text style={s.newsTitle} numberOfLines={3}>{item.title}</Text>
      <Text style={s.newsMeta} numberOfLines={1}>{relativeTime(item.publishedAt)}</Text>
    </View>
  </Pressable>;
}

export function placeStyle(name = "", kind?: string) {
  if (/hem|home/i.test(name))
    return { icon: "home" as IconName, color: colors.blue };
  if (/skola|förskola|school/i.test(name))
    return { icon: "school" as IconName, color: colors.community };
  if (/jobb|arbete|kontor|work/i.test(name))
    return { icon: "briefcase" as IconName, color: colors.ink };
  return {
    icon: "location" as IconName,
    color: kind === "watch" ? colors.amber : colors.green,
  };
}

export function PlaceLabel({ name, kind }: { name: string; kind?: string }) {
  const style = placeStyle(name, kind);
  return (
    <View style={s.placeLabel}>
      <View style={s.placeIcon}>
        <Ionicons name={style.icon} size={24} color={style.color} />
      </View>
      <Text style={s.placeText}>{name}</Text>
    </View>
  );
}

// Soft red/amber halos plus an exclamation pin approximate the heat look of the
// reference map without implying more precision than an area point has.
export function IncidentHeat({
  events,
  onOpen,
}: {
  events: Event[];
  onOpen?: (event: Event) => void;
}) {
  return (
    <>
      {events.map((event) => {
        const point = eventPoint(event);
        if (!point) return null;
        return [
          ...heatRings.map((ring,index)=><Circle key={`heat-${event.id}-${index}`} center={point} radius={ring.radius} strokeWidth={0} fillColor={`${index<3?'#FFBE16':flareColor(event)}${ring.alpha}`}/>),
          <MapLabelMarker
            key={`pin-${event.id}`}
            coordinate={point}
            title={event.type}
            description="Publicerad polisnotis · ungefärlig områdespunkt"
            onCalloutPress={() => onOpen?.(event)}
          >
            <View style={[s.pin, { backgroundColor: flareColor(event) }]}>
              <Text style={[s.pinText,flareColor(event)==='#FFBA08'&&{color:'#3A2800'}]}>!</Text>
            </View>
          </MapLabelMarker>,
        ];
      })}
    </>
  );
}

export function MapFab({
  icon,
  label,
  onPress,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[s.fab, style]}
    >
      <Ionicons name={icon} size={20} color={colors.blue} />
    </Pressable>
  );
}

export function MapPill({
  icon,
  label,
  onPress,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.mapPill, style]}
      hitSlop={4}
    >
      <Ionicons name={icon} size={16} color={colors.blue} />
      <Text style={s.mapPillText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
    marginBottom: 5,
  },
  headerSide: { width: 48, justifyContent: "center" },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  headerSubtitle: { fontSize: 12, color: colors.muted, marginTop: 1 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 12,
    minHeight: 42,
    marginBottom: 3,
    ...shadow,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, minHeight: 42, paddingVertical: 0 },
  referenceSearchRow:{flexDirection:'row',gap:6,alignItems:'center'},
  referenceSearch:{flex:1,borderRadius:12,minHeight:40,marginBottom:0},
  referenceFilter:{width:40,minHeight:40,borderRadius:12,backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',...shadow},
  searchBusy: { color: colors.muted, fontSize: 16 },
  searchFilter: {
    width: 39,
    minHeight: 39,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 11,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  sectionLink: { fontSize: 13, fontWeight: "700", color: colors.link },
  underline: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginVertical: 6,
  },
  underlineTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  underlineTabOn: { borderBottomColor: colors.blue },
  underlineText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  underlineTextOn: { color: colors.blue, fontWeight: "800" },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: '#F5F7FC',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  dropdownText: { color: colors.ink, fontSize: 10, fontWeight: "500" },
  tiles: { flexDirection: "row", gap: 6 },
  tile: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    minHeight: 86,
    ...shadow,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  tileTop: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 25 },
  tileIcon: {
    width: 21,
    height: 21,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: { flex: 1, fontSize: 10, fontWeight: "700", color: colors.ink },
  tileTime: { fontSize: 9, color: colors.muted, marginTop: 6 },
  tilePlace: { fontSize: 9, color: colors.muted, marginTop: 2 },
  referenceTile:{borderRadius:12,padding:9,minHeight:108,borderColor:'#C5D1E1',shadowOpacity:.05},
  referenceTileTop:{flexDirection:'column',alignItems:'flex-start',gap:4},
  referenceTileTitle:{flex:undefined,flexBasis:'auto',flexGrow:0,flexShrink:0,fontSize:12,fontWeight:'800'},
  referenceTileTime:{fontSize:11,marginTop:5,color:'#444B7A'},
  referenceTilePlace:{fontSize:10,marginTop:3,color:'#596184'},
  empty: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  news: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 10,
    ...shadow,
  },
  newsThumb: {
    width: 88,
    height: 78,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  newsTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: colors.ink,
  },
  newsSource:{fontSize:11,fontWeight:'700',color:colors.link},
  newsMeta: { fontSize: 11, color: colors.muted },
  placeLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth:1,
    borderColor:'#8EA5BC',
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 8,
    ...shadow,
    shadowOpacity:.16,
    elevation: 4,
  },
  placeIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  placeText: { fontSize: 14, fontWeight: "800", color: colors.ink },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  pinText: { color: "#fff", fontWeight: "900", fontSize: 18, lineHeight: 21 },
  fab: {
    position: "absolute",
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    borderWidth:1,
    borderColor:'#8EA5BC',
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
    elevation: 4,
  },
  mapPill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 36,
    ...shadow,
    elevation: 4,
  },
  mapPillText: { color: colors.link, fontWeight: "700", fontSize: 13 },
});
