import proj4 from 'proj4';
export function publicPoint(lat:number,lon:number){const projection='+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs';const [x,y]=proj4('WGS84',projection,[lon,lat]);const [longitude,latitude]=proj4(projection,'WGS84',[Math.floor(x/100)*100+50,Math.floor(y/100)*100+50]);return {lat:Number(latitude.toFixed(7)),lon:Number(longitude.toFixed(7))};}
