import Lobby, { LobbyState } from './Lobby';
import CoffeeMap from './CoffeeMap';

const map = new CoffeeMap(10, 10);
const lobby = new Lobby(map, 8000);

Promise
  .resolve(console.info('Partie créée. En attente des joueurs...'))
  .then(() => lobby.wait(LobbyState.OPPONENT_1_TURN))
  .then(() => console.info('Les joueurs sont en ligne. Début de la partie.'))
  .then(() => lobby.wait(LobbyState.FINISHED))
  .then(() => console.info('Partie terminée.'));