import { powerhitzStations } from './powerhitz.js';

export const stations = [
  {
    id: 'love-fm', name: 'Love FM', genre: 'Belize Radio',
    coverUrl: 'assets/stations/love-fm.png',
    streamUrl: 'https://s1.voscast.com:10243/lovefm', radioGardenId: '706LwqPg',
    website: 'https://lovefm.com/',
  },
  {
    ...powerhitzStations.find(station=>station.id==='powerhitz-hip-hop'),
    id: 'powerhitz-hip-hop', name: 'PowerHitz Hip Hop', genre: 'Hip Hop',
    streamUrl: 'https://live.powerhitz.com/1power', radioGardenId: 'dJzNTSmL',
    website: 'https://powerhitz.com/1Power',
    coverUrl: 'https://files.catbox.moe/zty178.png',
    trackFeed: {
      format: 'powerhitz', source: 'https://player.powerhitz.com/pwhitz/history.php?autoplay=2',
      url: 'https://player.powerhitz.com/external.php?http://ais-edge16-jbmedia-nyc04.cdnstream.com:12000/ice_history.php?h=ais-edge16-jbmedia-nyc04.cdnstream.com&p=7080&i=1power&f=ice&c=758643',
    },
  },
  {
    id: 'smooth-jazz-247', name: 'Smooth Jazz 24/7', genre: 'Smooth Jazz',
    coverUrl: 'assets/stations/smooth-jazz-247.png',
    streamUrl: 'https://ais-edge89-dal02.cdnstream.com/2124_128.mp3', radioGardenId: '1vlrqH6v',
  },
  {
    id: 'precious-radio-funk', name: 'Precious Radio Funk', genre: 'Funk',
    coverUrl: 'assets/stations/precious-radio-funk.png',
    streamUrl: 'https://centova.preciousradio.net/proxy/funk/stream', radioGardenId: 'QjkcZ1id',
    website: 'https://www.preciousradio.com/radios/radio-funk/',
  },
  {
    id: 'ambient-sleeping-pill', name: 'Ambient Sleeping Pill', genre: 'Ambient',
    coverUrl: 'assets/stations/ambient-sleeping-pill.png',
    streamUrl: 'https://radio.stereoscenic.com/asp-s', radioGardenId: 'nhy7nxrN',
    website: 'https://ambientsleepingpill.com/',
    trackFeed: {
      format: 'shoutcast', relay: true,
      source: 'https://ambientsleepingpill.com/history',
      url: 'https://radio.stereoscenic.com/played?sid=3&type=json',
    },
  },
  {
    id: 'vtjm-radio', name: 'VTJM Radio', genre: 'Variety',
    coverUrl: 'assets/stations/vtjm-radio.png',
    streamUrl: 'https://usa20.fastcast4u.com:1470/;', radioGardenId: 'h5XKBLBk',
  },
  {
    id: '90s-online-radio', name: '90s Online Radio', genre: '90s Hits',
    coverUrl: 'assets/stations/90s-online-radio.png',
    streamUrl: 'https://panel.retrolandigital.com/radio/8180/listen', radioGardenId: 'TxHGrKA4',
  },
  {
    id: 'somafm-bossa', name: 'SomaFM Bossa Beyond', genre: 'Bossa Nova / Samba',
    streamUrl: 'https://ice6.somafm.com/bossa-64-aac', website: 'https://somafm.com/bossa/',
    fallbackStreamUrl: 'https://ice6.somafm.com/bossa-128-mp3',
    coverUrl: 'https://api.somafm.com/logos/256/bossa256.jpg',
    trackFeed: { format: 'soma', url: 'https://somafm.com/songs/bossa.json', source: 'https://somafm.com/bossa/songhistory.html' },
  },
  {
    id: 'somafm-groove-salad', name: 'SomaFM Groove Salad', genre: 'Ambient / Downtempo',
    streamUrl: 'https://ice6.somafm.com/groovesalad-64-aac', website: 'https://somafm.com/groovesalad/',
    fallbackStreamUrl: 'https://ice6.somafm.com/groovesalad-128-mp3',
    coverUrl: 'https://api.somafm.com/logos/256/groovesalad256.png',
    trackFeed: { format: 'soma', url: 'https://somafm.com/songs/groovesalad.json', source: 'https://somafm.com/groovesalad/songhistory.html' },
  },
  ...powerhitzStations.filter(station=>station.id!=='powerhitz-hip-hop'),
];
