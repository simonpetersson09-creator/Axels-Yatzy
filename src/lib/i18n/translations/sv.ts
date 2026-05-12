// Svenska — fallback-språk
export const sv = {
  // App
  appName: 'Mr.B. Yatzy',
  tagline: 'Klassiskt tärningsspel i modern tappning',
  version: 'Version',

  // Generic
  ok: 'OK',
  cancel: 'Avbryt',
  back: 'Tillbaka',
  loading: 'Laddar…',
  or: 'eller',
  you: 'Du',
  guest: 'Gäst',

  // Home
  resumeMatch: 'Fortsätt pågående match',
  ongoingMatchRemaining: 'Pågående match – {time} kvar',
  quickMatch: 'Snabb match',
  selectPlayerCount: 'Välj antal spelare',
  opponent: 'motståndare',
  opponents: 'motståndare',
  playWithFriends: 'Spela med vänner',
  statGames: 'Spelade',
  statWins: 'Vinster',
  statHigh: 'Rekord',
  goSettings: 'Inställningar',
  matchExpired: 'Matchen har avslutats eftersom 48 timmar har gått utan aktivitet.',

  // Setup
  newGame: 'Nytt spel',
  playerCount: 'Antal spelare',
  playerNames: 'Spelarnamn',
  playerN: 'Spelare {n}',
  startGame: 'Starta spel',

  // Game
  roll: 'Kasta',
  rollAgain: 'Kasta igen',
  rollNoMore: '—',
  selectCategory: 'Välj kategori',
  selectCategoryFromBoard: 'Välj en kategori på brickan',
  rollCounter: 'Kast {n} / 3',
  home: 'Hem',
  toMenu: 'Till menyn',
  forfeit: 'Ge upp',
  forfeitConfirmTitle: 'Vill du ge upp matchen?',
  forfeitConfirmText: 'Om du ger upp avslutas matchen direkt.',
  forfeitConfirmTextWithWinner: 'Om du ger upp avslutas matchen direkt och {name} vinner.',
  forfeitButton: 'Ge upp match',
  thinking: 'Tänker…',
  waitingForPlayer: 'Väntar på {name}…',

  // Scoreboard
  upperSection: 'Övre sektionen',
  lowerSection: 'Nedre sektionen',
  sum: 'Summa',
  bonus: 'Bonus',
  total: 'Totalt',

  // Categories
  cat_ones: 'Ettor',
  cat_twos: 'Tvåor',
  cat_threes: 'Treor',
  cat_fours: 'Fyror',
  cat_fives: 'Femmor',
  cat_sixes: 'Sexor',
  cat_pair: '1 par',
  cat_twoPairs: '2 par',
  cat_threeOfAKind: 'Triss',
  cat_fourOfAKind: 'Fyrtal',
  cat_smallStraight: 'Liten stege',
  cat_largeStraight: 'Stor stege',
  cat_fullHouse: 'Kåk',
  cat_chance: 'Chans',
  cat_yatzy: 'Yatzy',

  // Celebrations
  celeb_threeOfAKind: 'Triss',
  celeb_fourOfAKind: 'Fyrtal!',
  celeb_smallStraight: 'Liten stege',
  celeb_largeStraight: 'Stor stege!',
  celeb_fullHouse: 'Kåk!',

  // Game over
  youWin: 'Du vinner!',
  playerWins: '{name} vinner!',
  finalResult: 'Slutresultat',
  playAgain: 'Spela igen',
  rematch: 'Rematch',
  newMatch: 'Ny match',
  toHome: 'Till startsidan',
  matchEnded: 'Match avslutad',
  forfeited: 'gav upp',
  forfeitedTag: 'Gav upp',
  playerWonBang: '{name} vann!',
  gameOver: 'Spelet slut!',

  // Multiplayer
  multiplayer: 'Multiplayer',
  yourName: 'Ditt namn',
  enterYourName: 'Ange ditt namn',
  createGame: 'Skapa spel',
  enterGameCode: 'Ange spelkod',
  joinGame: 'Gå med',
  waitingForPlayers: 'Väntar på spelare',
  gameCode: 'Spelkod',
  shareCode: 'Dela koden med dina vänner',
  playersOfMax: 'Spelare ({count}/4)',
  host: 'Värd',
  waitingMorePlayers: 'Väntar på minst en spelare till…',
  waitingForHost: 'Väntar på att värden startar spelet…',
  codeLabel: 'Kod: {code}',
  loadingGame: 'Laddar spel…',
  backToMenu: 'Tillbaka till menyn',

  // Errors
  errCreateGame: 'Kunde inte skapa spel',
  errJoinGame: 'Kunde inte gå med i spelet',
  errStartGame: 'Kunde inte starta spelet',
  errValidate: 'Kunde inte validera spelåtkomst',
  errAccessDenied: 'Åtkomst nekad',
  errRejoin: 'Kunde inte återansluta till spelet',
  errGeneric: 'Något gick fel',

  // Settings
  settings: 'Inställningar',
  profile: 'Profil',
  playerName: 'Spelarnamn',
  enterName: 'Ange ditt spelnamn',
  avatar: 'Profilbild',
  changeAvatar: 'Byt bild',
  removeAvatar: 'Ta bort',
  language: 'Språk',
  statistics: 'Statistik',
  resetStats: 'Återställ statistik',
  resetStatsConfirm: 'Är du säker? All statistik raderas.',
  resetDone: 'Statistik återställd',
  nameSaved: 'Spelnamn sparat',
  avatarSaved: 'Profilbild sparad',
  avatarRemoved: 'Profilbild borttagen',
  languageSaved: 'Språk uppdaterat',

  // Not found
  notFound: 'Sidan kunde inte hittas',
  returnHome: 'Tillbaka till startsidan',
};

export type TranslationKey = keyof typeof sv;
