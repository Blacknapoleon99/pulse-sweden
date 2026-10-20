// Clearer separation between roads, land, parks and water, with dark labels.
export const referenceMapStyle = [
  {elementType:'geometry',stylers:[{color:'#E4E9E5'}]},
  {elementType:'labels.text.fill',stylers:[{color:'#344654'}]},
  {elementType:'labels.text.stroke',stylers:[{color:'#FFFFFF'}]},
  {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'poi.park',elementType:'geometry',stylers:[{color:'#B6D5A6'}]},
  {featureType:'landscape.natural',elementType:'geometry',stylers:[{color:'#C8DCB8'}]},
  {featureType:'road',elementType:'geometry',stylers:[{color:'#FFFFFF'}]},
  {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#A6B4BE'}]},
  {featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},
  {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#F4D78A'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#95C7E2'}]},
  {featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]},
];
