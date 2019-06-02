import * as udp from 'dgram';
import CoffeeMap from './CoffeeMap';
import { EventEmitter } from 'events';

export const MESSAGES = Object.freeze({
  HELLO(this: LobbyOpponent) {
    return `${this.id + 1}-Bonjour ${this.teamName}`
  },

  LOBBY_START: (map: CoffeeMap) => `01-la partie va commencer\nMAP=${map}`,
  LOBBY_END: () => '88-Partie Terminée',

  TURN_START: () => '10-A vous de jouer :',

  OPPONENT_PLAYED: (cell: string) => `20:coup adversaire:${cell}`,

  YOU_FAILED: () => '21:coup joué illégal',
  OPPONENT_FAILED: () => '22:coup adversaire illegal',
});

export enum LobbyOpponentId {
  WHITE = 0,
  BLACK = 1
}

export class LobbyOpponent {
  constructor(
    private readonly serverSocket: udp.Socket,
    public readonly id: LobbyOpponentId,
    public readonly teamName: string,
    public readonly simplifiedMode: boolean,
    private readonly endpoint: udp.RemoteInfo
  ) { }

  public send<K extends keyof typeof MESSAGES>(
    message: K,
    ...args: (
      (typeof MESSAGES)[K] extends (...a: infer R) => string
      ? R
      : never
    )
  ) {
    return new Promise<number>((res, rej) =>
      this.serverSocket.send(
        MESSAGES[message].apply(this, args),
        this.endpoint.port,
        this.endpoint.address,
        (err, bytes) => err ? rej(err) : res(bytes))
    );
  }

  public compare(from: udp.RemoteInfo): boolean {
    return this.endpoint.address === from.address && this.endpoint.port === from.port;
  }
}

export enum LobbyState {
  WAITING_OPPONENT_1,
  WAITING_OPPONENT_2,

  OPPONENT_1_TURN,
  OPPONENT_2_TURN,

  FINISHED
};

export default class Lobby extends EventEmitter {
  public static readonly DEFAULT_MAX_TURN_COUNT = 56;
  public static readonly DEFAULT_MAX_TURN_DURATION = 1_000;

  private static turn(this: Lobby, validState: LobbyState) {
    if (this.turnCount >= this.options.maxTurnCount)
      return LobbyState.FINISHED;
    else {
      this.turnCount++;
      this.turnStartDate = Date.now();
      this.turnTimeout = setTimeout(this.next.bind(this), this.options.maxTurnDuration);
      return validState;
    }
  }

  private static readonly STATE_TABLE: Readonly<{ [key in LobbyState]?: LobbyState | ((this: Lobby) => LobbyState) }> = Object.freeze({
    [LobbyState.WAITING_OPPONENT_1]: LobbyState.WAITING_OPPONENT_2,
    [LobbyState.WAITING_OPPONENT_2](this: Lobby) {
      // Lobby started
      this.sendAll('LOBBY_START', this.map);
      return LobbyState.OPPONENT_1_TURN;
    },

    [LobbyState.OPPONENT_1_TURN](this: Lobby) { return <LobbyState>Lobby.turn.call(this, LobbyState.OPPONENT_2_TURN); },
    [LobbyState.OPPONENT_2_TURN](this: Lobby) { return <LobbyState>Lobby.turn.call(this, LobbyState.OPPONENT_1_TURN); }
  });

  private readonly socket: udp.Socket;

  private state: LobbyState = LobbyState.WAITING_OPPONENT_1;
  private turnTimeout: NodeJS.Timeout = null;
  private turnStartDate: number = null;
  private turnCount = 1;

  private opponent1: LobbyOpponent = null;
  private opponent2: LobbyOpponent = null;

  constructor(
    public readonly map: CoffeeMap,
    public readonly port: number,
    public readonly options = {
      maxTurnCount: Lobby.DEFAULT_MAX_TURN_COUNT,
      maxTurnDuration: Lobby.DEFAULT_MAX_TURN_DURATION
    }
  ) {
    super();
    this.socket = udp.createSocket('udp4', this.onPacket.bind(this));
    this.socket.bind(port);
    if (!this.options.maxTurnCount)
      this.options.maxTurnCount = Lobby.DEFAULT_MAX_TURN_COUNT;
    if (!this.options.maxTurnDuration)
      this.options.maxTurnDuration = Lobby.DEFAULT_MAX_TURN_DURATION;
  }

  public wait(expected?: LobbyState): Promise<void> {
    return new Promise<void>(res => this.once('state_changed', state => (!expected || state === expected) && res()));
  }

  private canPlay(): boolean {
    return this.map.canPlay();
  }

  private next(): void {
    this.turnTimeout && clearTimeout(this.turnTimeout);
    if (!this.canPlay() || (this.turnStartDate && this.turnStartDate >= this.options.maxTurnDuration)) {
      if (this.state !== LobbyState.FINISHED) {
        this.state = LobbyState.FINISHED;
        this.emit('state_changed', this.state);
        // Lobby ended
        this.sendAll('LOBBY_END');
        this.socket.close();
      }
    } else {
      const update = Lobby.STATE_TABLE[this.state];
      const newState = <LobbyState>(
        update ? update instanceof Function ?
          update.call(this) :
          update :
          null
      );
      if (newState) {
        this.state = newState;
        this.emit('state_changed', this.state);
      }
    }
  }

  private getSender(from: udp.RemoteInfo): LobbyOpponent {
    switch (this.state) {
      case LobbyState.WAITING_OPPONENT_2:
        if (this.opponent1.compare(from))
          return this.opponent1;
      case LobbyState.WAITING_OPPONENT_1:
        return null;

      default:
        if (this.opponent1.compare(from))
          return this.opponent1;
        if (this.opponent2.compare(from))
          return this.opponent2;
        return null;
    }
  }

  public sendAll<K extends keyof typeof MESSAGES>(
    _message: K,
    ..._args: (
      (typeof MESSAGES)[K] extends (...a: infer R) => string
      ? R
      : never
    )
  ) {
    return Promise.all(
      [this.opponent1, this.opponent2]
        .map(op => op.send.apply(op, arguments))
    );
  }

  private welcomeOpponent(id: LobbyOpponentId, firstMessage: string, from: udp.RemoteInfo): LobbyOpponent {
    const simplifiedMode = firstMessage.startsWith('#');
    if (simplifiedMode && firstMessage.length < 2) // Empty team name
      return null;
    const opponent = new LobbyOpponent(
      this.socket,
      id,
      simplifiedMode ? firstMessage.slice(1) : firstMessage,
      simplifiedMode,
      from
    );
    opponent.send('HELLO');
    this.emit('joined', opponent);
    return opponent;
  }

  private turn(opponent: LobbyOpponent, choice: string) {
    // TODO
  }

  private onPacket(data: Buffer, from: udp.RemoteInfo): void {
    if (data.length < 1)
      return;
    const message = data.toString('utf8');
    const sender = this.getSender(from);
    switch (this.state) {
      case LobbyState.WAITING_OPPONENT_1:
        if (!(this.opponent1 = this.welcomeOpponent(LobbyOpponentId.WHITE, message, from)))
          return;
        break;
      case LobbyState.WAITING_OPPONENT_2:
        if (sender) // Anti-cheat
          return;
        if (!(this.opponent2 = this.welcomeOpponent(LobbyOpponentId.BLACK, message, from)))
          return;
        break;

      case LobbyState.OPPONENT_1_TURN:
      case LobbyState.OPPONENT_2_TURN:
        if (sender !== (this.state === LobbyState.OPPONENT_1_TURN ? this.opponent1 : this.opponent2)) // Anti-cheat
          return;
        this.turn(sender, message);
        break;
    }
    this.next();
  }
};
