// Event cards: occasional choices with real trade-offs. Data only. Owner: PROGRESSION.
// Logic in src/sim/goals.js (rolls, conditions, effects). A card sets G.event and
// pauses the colony until act.choose(i).
//   needs   { day, chapter, building, research, pop, ships, notFlag } all optional
//   weight  relative chance; once: true never repeats; cooldown in days before it can repeat
//   options [{ label, desc, cost?, effects }] (cost: {res|coin|insight: n}, the option is refused if unaffordable)
// effects: coin, insight, res {id: n} (home network), pop n, happiness {v, days},
//   production {v, days}, growth {v, days}, rep {port|null(all), n}, raid strength,
//   storm power, fire n (buildings catch fire), discover n (hidden islands),
//   research fraction (of the current project), chance {p, win:{...}, lose:{...}}, text.
export const EVENTS = [
  {
    id: 'refugees', title: 'A Refugee Skiff', art: 'airship', weight: 3, cooldown: 6, needs: { day: 3 },
    text: 'A battered skiff limps out of the cloud with six families aboard. Their home isle sank in last month\'s storms.',
    options: [
      { label: 'Take them in', desc: '+6 settlers, -20 bread', cost: { bread: 20 }, effects: { pop: 6, happiness: { v: 0.04, days: 1 }, text: 'The families find beds and a warm meal. They will work hard.' } },
      { label: 'Supply them and wave them on', desc: '-10 bread, the ports hear of it', cost: { bread: 10 }, effects: { rep: { port: null, n: 6 }, text: 'Word of your kindness reaches every port.' } },
      { label: 'Turn them away', desc: 'Settlers grumble', effects: { happiness: { v: -0.08, days: 1 }, text: 'The skiff drifts on. Nobody speaks of it at the tavern.' } },
    ],
  },
  {
    id: 'merchant', title: 'A Merchant\'s Offer', art: 'coin', weight: 3, cooldown: 4, needs: { day: 4 },
    text: 'A Brass Reach trader ties up at the town hall: forty bars of good iron, cheap, if you pay in coin today.',
    options: [
      { label: 'Buy the iron', desc: '+40 iron for 160 coin', cost: { coin: 160 }, effects: { res: { iron: 40 }, text: 'Forty bars stacked by the smithy.' } },
      { label: 'Haggle', desc: 'Half the time he takes 100 coin', effects: { chance: { p: 0.5, win: { coin: -100, res: { iron: 40 }, text: 'He spits, shakes on it, and the iron is yours for 100.' }, lose: { rep: { port: 'brassreach', n: -4 }, text: 'Insulted, he casts off. Brass Reach will hear of it.' } } } },
      { label: 'Send him away', desc: 'Nothing changes', effects: { text: 'He tips his hat and drifts off toward the ports.' } },
    ],
  },
  {
    id: 'crystalhum', title: 'The Crystal Hum', art: 'crystal', weight: 2, cooldown: 8, needs: { day: 6 },
    text: 'The crystals under Kilnshelf have started to hum, a low note felt in the teeth. Lamps flicker near them at night.',
    options: [
      { label: 'Let the scholars study it', desc: '+80 insight, a small risk of fire', effects: { insight: 80, chance: { p: 0.25, win: {}, lose: { fire: 1, text: 'A crackle of blue light sets a roof alight!' } }, text: 'Pages of notes and a new theory of resonance.' } },
      { label: 'Chip the singing crystals out', desc: '+15 skystone', effects: { res: { skystone: 15 }, text: 'The hum stops. The crystals are strangely light in the hand.' } },
      { label: 'Leave them be', desc: 'Settlers sleep badly for a night', effects: { happiness: { v: -0.04, days: 1 }, text: 'The hum fades by itself after a few nights.' } },
    ],
  },
  {
    id: 'whales', title: 'Sky Whales Passing', art: 'cloud', weight: 2, cooldown: 10, needs: { day: 5 },
    text: 'A pod of sky whales drifts past the islands, singing. Everyone has stopped work to watch.',
    options: [
      { label: 'Declare a holiday', desc: 'Happy settlers, slower work for a day', effects: { happiness: { v: 0.12, days: 2 }, production: { v: -0.15, days: 1 }, text: 'Picnics on every cliff edge. Nobody forgets it.' } },
      { label: 'Back to work', desc: 'Nothing lost, nothing gained', effects: { text: 'The foremen ring the bells. The whales sing on without an audience.' } },
    ],
  },
  {
    id: 'tribute', title: 'The Crimson Gale\'s Envoy', art: 'skull', weight: 2, cooldown: 7, needs: { chapter: 4, notFlag: 'roostTaken' },
    text: 'A red-sailed corsair drops anchor under a white flag. Pay tribute, says the envoy, or the Gale pays you a visit.',
    options: [
      { label: 'Pay 200 coin', desc: 'No raid for now', cost: { coin: 200 }, effects: { text: 'The envoy bites a coin, grins and sails away.' } },
      { label: 'Offer 30 iron instead', desc: 'They may take it', cost: { iron: 30 }, effects: { chance: { p: 0.6, win: { text: 'They grumble, load the iron and go.' }, lose: { raid: 0.6, text: 'They take the iron and laugh. Sails on the horizon!' } } } },
      { label: 'Refuse', desc: 'A raid is coming', effects: { raid: 0.8, happiness: { v: 0.05, days: 1 }, text: 'The envoy spits over the rail. The town cheers, then reaches for the harpoons.' } },
    ],
  },
  {
    id: 'scholar', title: 'A Wandering Scholar', art: 'flask', weight: 2, cooldown: 6, needs: { building: 'academy' },
    text: 'An old scholar from Port Halcyon offers a season of lectures at your academy, for a fee.',
    options: [
      { label: 'Hire her', desc: '+150 insight for 120 coin', cost: { coin: 120 }, effects: { insight: 150, text: 'The lecture hall is packed every night.' } },
      { label: 'Ask her to help the current project', desc: 'Current research jumps ahead', cost: { coin: 80 }, effects: { research: 0.3, text: 'She spots the flaw in a week of calculations in an hour.' } },
      { label: 'Decline politely', desc: 'Nothing changes', effects: { text: 'She leaves a book behind anyway.' } },
    ],
  },
  {
    id: 'harvest', title: 'A Bumper Harvest', art: 'grain', weight: 2, cooldown: 8, needs: { building: 'farm' },
    text: 'The fields have never been so full. The bakers ask for a festival; the merchants ask for the surplus.',
    options: [
      { label: 'Hold a harvest festival', desc: '-30 bread, everyone happy for two days', cost: { bread: 30 }, effects: { happiness: { v: 0.15, days: 2 }, growth: { v: 0.3, days: 2 }, text: 'Lanterns, music and pie. New families ask to settle.' } },
      { label: 'Store the surplus', desc: '+60 grain', effects: { res: { grain: 60 }, text: 'Every granary is full to the rafters.' } },
      { label: 'Sell it to Verdant Drift', desc: '+90 coin', effects: { coin: 90, rep: { port: 'verdantdrift', n: 4 }, text: 'Barges of grain go out on the morning wind.' } },
    ],
  },
  {
    id: 'derelict', title: 'A Drifting Derelict', art: 'airship', weight: 2, cooldown: 7, needs: { day: 8 },
    text: 'A cargo ship drifts past with no crew and a full hold. It could be salvage. It could be bait.',
    options: [
      { label: 'Salvage it', desc: 'Goods, or a pirate trap', effects: { chance: { p: 0.7, win: { res: { parts: 15, iron: 20, planks: 30 }, text: 'Crates of parts, iron and timber. Lucky.' }, lose: { raid: 0.5, text: 'The hold is empty and red sails rise behind it. A trap!' } } } },
      { label: 'Report it to Port Halcyon', desc: 'Standing with the port', effects: { rep: { port: 'porthalcyon', n: 10 }, coin: 40, text: 'The harbour master pays a finder\'s fee and remembers your name.' } },
      { label: 'Let it drift', desc: 'Nothing changes', effects: { text: 'It slips into the cloud and is gone.' } },
    ],
  },
  {
    id: 'apprentices', title: 'Guild Apprentices', art: 'gear', weight: 2, cooldown: 8, needs: { chapter: 3 },
    text: 'The Brass Reach guild will lend you a dozen eager apprentices for a few days, if you cover their board.',
    options: [
      { label: 'Take them on', desc: '+12% production for 2 days, 100 coin', cost: { coin: 100 }, effects: { production: { v: 0.12, days: 2 }, rep: { port: 'brassreach', n: 4 }, text: 'Every workshop rings with hammers.' } },
      { label: 'No thank you', desc: 'Nothing changes', effects: { text: 'The guild shrugs.' } },
    ],
  },
  {
    id: 'chimney', title: 'A Chimney Fire', art: 'fire', weight: 2, cooldown: 6, needs: { day: 4 },
    text: 'Sparks are pouring from a chimney. The bucket brigade asks for timber to build a firebreak.',
    options: [
      { label: 'Build the firebreak', desc: '-15 planks, safe', cost: { planks: 15 }, effects: { text: 'The firebreak holds and the chimney burns itself out.' } },
      { label: 'Trust the buckets', desc: 'It may spread', effects: { chance: { p: 0.55, win: { text: 'The brigade beats it out. Soot everywhere, but no harm done.' }, lose: { fire: 2, text: 'The wind catches it. Two roofs are burning!' } } } },
    ],
  },
  {
    id: 'fever', title: 'Mist Fever', art: 'settler', weight: 2, cooldown: 9, needs: { pop: 25 },
    text: 'A damp mist has settled for days, and with it a fever. The healers are worried.',
    options: [
      { label: 'Fetch a healer from the ports', desc: '-80 coin', cost: { coin: 80 }, effects: { text: 'Tonics and fresh air. The fever breaks in two days.' } },
      { label: 'Quarantine the sick', desc: 'Slower work for a day', effects: { production: { v: -0.2, days: 1 }, text: 'Half the town stays home. The fever passes.' } },
      { label: 'Carry on', desc: 'Some settlers may leave', effects: { pop: -4, happiness: { v: -0.06, days: 1 }, text: 'Four settlers take the next skiff out.' } },
    ],
  },
  {
    id: 'cartographer', title: 'The Cartographer', art: 'compass', weight: 2, once: true, needs: { chapter: 4 },
    text: 'A cartographer with ink-stained fingers offers a chart of the uncharted east, very old and very expensive.',
    options: [
      { label: 'Buy the chart', desc: '-150 coin, a hidden island revealed', cost: { coin: 150 }, effects: { discover: 1, text: 'A new island appears on the Sky Chart.' } },
      { label: 'Copy it while he naps', desc: 'Risky', effects: { chance: { p: 0.5, win: { discover: 1, text: 'A hasty sketch, but good enough.' }, lose: { happiness: { v: -0.03, days: 1 }, rep: { port: 'porthalcyon', n: -6 }, text: 'He wakes. Port Halcyon hears all about it.' } } } },
      { label: 'Not today', desc: 'Nothing changes', effects: { text: 'He rolls up the chart and leaves on the next ship.' } },
    ],
  },
  {
    id: 'aurora', title: 'Aether Lights', art: 'aether', weight: 2, cooldown: 8, needs: { building: 'refinery' },
    text: 'Green aether lights dance over the refinery. The alchemists want to catch them in jars.',
    options: [
      { label: 'Catch the lights', desc: '+12 aether, may spark a fire', effects: { res: { aether: 12 }, chance: { p: 0.7, win: {}, lose: { fire: 1, text: 'A jar bursts. The refinery roof is alight!' } }, text: 'Twelve jars glow on the shelf.' } },
      { label: 'Watch from the cliffs', desc: 'A happy evening', effects: { happiness: { v: 0.06, days: 1 }, text: 'The whole town watches until dawn.' } },
    ],
  },
  {
    id: 'festival', title: 'An Invitation', art: 'scroll', weight: 2, cooldown: 7, needs: { chapter: 3 },
    text: 'Verdant Drift holds its Mistmoon festival. Every friendly town sends gifts.',
    options: [
      { label: 'Send bread', desc: '-30 bread, +standing at Verdant Drift', cost: { bread: 30 }, effects: { rep: { port: 'verdantdrift', n: 14 }, text: 'Your bread wins a ribbon.' } },
      { label: 'Send brass parts', desc: '-10 parts, +standing at every port', cost: { parts: 10 }, effects: { rep: { port: null, n: 8 }, text: 'Your clockwork birds are the talk of three ports.' } },
      { label: 'Stay home', desc: 'Nothing changes', effects: { text: 'The festival goes on without you.' } },
    ],
  },
  {
    id: 'oldminer', title: 'The Old Miner\'s Tale', art: 'ore', weight: 2, cooldown: 9, needs: { building: 'mine' },
    text: 'An old miner swears there is a rich seam behind the third gallery. The young ones think he\'s been at the ale.',
    options: [
      { label: 'Dig where he says', desc: 'Ore and coal, or nothing', effects: { chance: { p: 0.65, win: { res: { ore: 50, coal: 30 }, text: 'He was right! Ore glitters in the lamplight.' }, lose: { production: { v: -0.05, days: 1 }, text: 'Nothing but rock and a lost day.' } } } },
      { label: 'Buy him an ale', desc: 'Happy miners', cost: { coin: 20 }, effects: { happiness: { v: 0.04, days: 1 }, text: 'He tells the tale again. Everyone cheers.' } },
    ],
  },
  {
    id: 'pilgrims', title: 'Pilgrims of the Forge', art: 'skyforge', weight: 3, cooldown: 5, needs: { building: 'skyforge' },
    text: 'Word of the Skyforge has spread. Pilgrims arrive by every skiff, ready to work or to give.',
    options: [
      { label: 'Let them settle', desc: '+10 settlers', effects: { pop: 10, text: 'New hands for the great work.' } },
      { label: 'Ask for gifts for the forge', desc: '+40 stone, +30 iron', effects: { res: { stone: 40, iron: 30 }, text: 'Carts of stone and iron roll up to the forge.' } },
    ],
  },
  {
    id: 'volunteers', title: 'Militia Volunteers', art: 'shield', weight: 2, cooldown: 8, needs: { research: 'harpoons' },
    text: 'Young settlers want to drill with the harpoon crews. The foremen say they are needed in the workshops.',
    options: [
      { label: 'Let them drill', desc: 'Safer, slower', effects: { production: { v: -0.06, days: 1 }, happiness: { v: 0.05, days: 2 }, flag: 'drilled', text: 'The batteries have never been so well crewed.' } },
      { label: 'Keep them at work', desc: 'Nothing changes', effects: { text: 'Grumbling, they go back to their benches.' } },
    ],
  },
];
