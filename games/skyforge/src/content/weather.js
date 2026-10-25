// Weather kinds (THREATS). Data only; the sim is src/sim/weather.js.
// { id, name, icon, desc, wind (base wind strength 0..1), rain (0..1, helps put
//   fires out), sight (gun range multiplier for batteries), dur [min, max] game
//   seconds, weight (base chance in the schedule), fireGrow (fire growth multiplier) }
export const WEATHER = [
  { id: 'clear', name: 'Clear skies', icon: 'sun', wind: 0.2, rain: 0, sight: 1, dur: [120, 260], weight: 5, fireGrow: 1,
    desc: 'Fair weather. Long sight lines for the batteries.' },
  { id: 'breeze', name: 'Fresh breeze', icon: 'wind', wind: 0.6, rain: 0, sight: 1, dur: [90, 200], weight: 3, fireGrow: 1.35,
    desc: 'A steady wind. Fires spread faster downwind.' },
  { id: 'rain', name: 'Rain', icon: 'rain', wind: 0.4, rain: 0.7, sight: 0.9, dur: [80, 180], weight: 2.2, fireGrow: 0.5,
    desc: 'Soft rain over the islands. Fires burn low and go out sooner.' },
  { id: 'fog', name: 'Fog bank', icon: 'fog', wind: 0.1, rain: 0.15, sight: 0.65, dur: [60, 140], weight: 1.2, fireGrow: 0.8,
    desc: 'Thick cloud rolls through. Batteries see less far, and raids come with less warning.' },
  { id: 'storm', name: 'Thunderstorm', icon: 'storm', wind: 0.75, rain: 1, sight: 0.8, dur: [70, 130], weight: 0, fireGrow: 1.1,
    desc: 'Lightning seeks the tallest buildings: lightning rods catch it and charge the lash. Strong gales stop cable cars and slow airships.' },
];
