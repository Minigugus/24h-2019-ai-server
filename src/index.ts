import Lobby, { LobbyState } from './Lobby';
import CoffeeMap from './CoffeeMap';
import { readFileSync } from 'fs';

let mapPath = process.argv[2] || process.env.MAP_PATH;

const DATA = mapPath ? readFileSync(mapPath, 'utf8') : process.env.MAP_DATA;
if (!DATA)
  throw new Error('You must provide the path to the PPM image representing the map as an argument or MAP_PATH environment variable. You can also set the whole PPM data in the MAP_DATA environment variable.');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;
  
const map = CoffeeMap.fromPPM(DATA);
const lobby = new Lobby(map, PORT);

Promise
  .resolve(console.info('Lobby created on UDP port %d. Waiting for players...%s', PORT, map.toString()))
  .then(() => lobby.wait(LobbyState.WHITE_PLAYER_TURN))
  .then(() => console.info('Players online. Lobby is starting.'))
  .then(() => lobby.wait(LobbyState.COMPLETED))
  .then(() => console.info('Lobby completed.'));
