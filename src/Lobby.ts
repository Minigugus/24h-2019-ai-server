import * as udp from 'dgram';
import CoffeeMap, { CoffeeMapInstance } from './CoffeeMap';
import { EventEmitter } from 'events';

export const MESSAGES = Object.freeze({
  HELLO(this: LobbyOpponent) {
    return `01-Bonjour ${this.teamName}\nVous êtes le Joueur ${this.id + 1}, attente de la suite...`
  },

  LOBBY_START(this: LobbyOpponent, instance: CoffeeMapInstance) {
    return `01-la partie va commencer\nMAP=${instance.data.prepare(this.simplifiedMode)}`;
  },
  LOBBY_END(this: LobbyOpponent, white: number, black: number) {
    return `88 Fin de la partie, vous avez ${(this.id === LobbyOpponentId.WHITE) === (white > black) ? 'gagne' : 'perdu'} : ${white}/${black}`;
  },

  TURN_START: () => '10-A vous de jouer ',

  OPPONENT_PLAYED: (cell: string) => `20:coup adversaire:${cell}`,

  YOU_FAILED: () => '21:coup joue illegal',
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
    const data = MESSAGES[message].apply(this, args);
    return new Promise<number>((res, rej) =>
      this.serverSocket.send(
        data,
        this.endpoint.port,
        this.endpoint.address,
        (err, bytes) => err ? rej(err) : res(bytes))
    ).then(() => console.info('SEND %s:%d  > %s', this.endpoint.address, this.endpoint.port, data));
  }

  public compare(from: udp.RemoteInfo): boolean {
    return this.endpoint.address === from.address && this.endpoint.port === from.port;
  }
}

export enum LobbyState {
  WAITING_WHITE_PLAYER,
  WAITING_BLACK_PLAYER,

  WHITE_PLAYER_TURN,
  BLACK_PLAYER_TURN,

  COMPLETED
};

export default class Lobby extends EventEmitter {
  public static readonly DEFAULT_MAX_TURN_COUNT = 56;
  public static readonly DEFAULT_MAX_TURN_DURATION = 1_000;

  private static exitTurn(this: Lobby, validState: LobbyState) {
    if (this.turnTimeout)
      clearTimeout(this.turnTimeout);
    const now = Date.now();
    const lastTurnStartDate = this.turnStartDate;
    if (lastTurnStartDate)
      console.error('Turn duration : %d ms', now - lastTurnStartDate);
    if (
      !this.canPlay() ||
      (this.turnStartDate && (now - this.turnStartDate) >= this.options.maxTurnDuration) ||
      this.turnCount >= this.options.maxTurnCount
    )
      return LobbyState.COMPLETED;
    else {
      this.turnStartDate = now;
      this.turnTimeout = setTimeout(this.next.bind(this), this.options.maxTurnDuration);
      return validState;
    }
  }

  private static readonly STATE_ENTER_TABLE: Readonly<{ [key in LobbyState]?: (this: Lobby) => void }> = Object.freeze({
    [LobbyState.WHITE_PLAYER_TURN](this: Lobby) { return this.whitePlayer.send('TURN_START'); },
    [LobbyState.BLACK_PLAYER_TURN](this: Lobby) { return this.blackPlayer.send('TURN_START'); },

    async [LobbyState.COMPLETED](this: Lobby) {
      try {
        await this.sendAll('LOBBY_END', 0, 0); // TODO : Score
      } finally {
        this.socket.close();
      }
    }
  });

  private static readonly STATE_EXIT_TABLE: Readonly<{ [key in LobbyState]?: LobbyState | ((this: Lobby) => LobbyState) }> = Object.freeze({
    [LobbyState.WAITING_WHITE_PLAYER]: LobbyState.WAITING_BLACK_PLAYER,
    [LobbyState.WAITING_BLACK_PLAYER](this: Lobby) {
      // Lobby started
      this.sendAll('LOBBY_START', this.map);
      return <LobbyState>Lobby.exitTurn.call(this, LobbyState.WHITE_PLAYER_TURN);
    },

    [LobbyState.WHITE_PLAYER_TURN](this: Lobby) { return <LobbyState>Lobby.exitTurn.call(this, LobbyState.BLACK_PLAYER_TURN); },
    [LobbyState.BLACK_PLAYER_TURN](this: Lobby) { this.turnCount++; return <LobbyState>Lobby.exitTurn.call(this, LobbyState.WHITE_PLAYER_TURN); }
  });

  private readonly socket: udp.Socket;

  private state: LobbyState = LobbyState.WAITING_WHITE_PLAYER;
  private turnTimeout: NodeJS.Timeout | null = null;
  private turnStartDate: number | null = null;
  private turnCount = 1;

  private whitePlayer: LobbyOpponent;
  private blackPlayer: LobbyOpponent;

  public map: CoffeeMapInstance;

  constructor(
    map: CoffeeMap,
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
    this.map = map.instanciate();
  }

  public wait(expected?: LobbyState): Promise<void> {
    return new Promise<void>(res => {
      const cb = (state: LobbyState) => {
        if (expected === undefined || state === expected) {
          this.off('state_changed', cb);
          res();
        }
      };
      this.on('state_changed', cb);
    });
  }

  private canPlay(): boolean {
    return this.map.canPlay();
  }

  private next(): void {
    const update = Lobby.STATE_EXIT_TABLE[this.state];
    const newState = <LobbyState>(
      update ? update instanceof Function ?
        update.call(this) :
        update :
        null
    );
    if (newState) {
      const update = Lobby.STATE_ENTER_TABLE[newState];
      if (update)
        update.call(this);
      this.emit('state_changed', newState);
      this.state = newState;
    }
  }

  private getSender(from: udp.RemoteInfo): LobbyOpponent | null {
    switch (this.state) {
      case LobbyState.WAITING_BLACK_PLAYER:
        if (this.whitePlayer.compare(from))
          return this.whitePlayer;
      case LobbyState.WAITING_WHITE_PLAYER:
        return null;

      default:
        if (this.whitePlayer.compare(from))
          return this.whitePlayer;
        if (this.blackPlayer.compare(from))
          return this.blackPlayer;
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
      [this.whitePlayer, this.blackPlayer]
        .map(op => op.send.apply(op, arguments))
    );
  }

  private welcomeOpponent(id: LobbyOpponentId, firstMessage: string, from: udp.RemoteInfo): LobbyOpponent | null {
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

  private turn(choice: string, playing: LobbyOpponent, other: LobbyOpponent) {
    if (this.map.add(choice, playing === this.blackPlayer))
      other.send('OPPONENT_PLAYED', choice);
    else {
      playing.send('YOU_FAILED');
      other.send('OPPONENT_FAILED');
    }
  }

  private onPacket(data: Buffer, from: udp.RemoteInfo): void {
    if (data.length < 1)
      return;
    const message = data.toString('utf8');
    console.info('RECV %s:%d <  %s', from.address, from.port, message);
    const sender = this.getSender(from);
    switch (this.state) {
      case LobbyState.WAITING_WHITE_PLAYER:
        {
          const opponent = this.welcomeOpponent(LobbyOpponentId.WHITE, message, from);
          if (!opponent)
            return;
          this.whitePlayer = opponent;
        }
        break;
      case LobbyState.WAITING_BLACK_PLAYER:
        if (sender) // Anti-cheat
          return;
        {
          const opponent = this.welcomeOpponent(LobbyOpponentId.BLACK, message, from);
          if (!opponent)
            return;
          this.blackPlayer = opponent;
        }
        break;

      case LobbyState.WHITE_PLAYER_TURN:
      case LobbyState.BLACK_PLAYER_TURN:
        const other = (this.state === LobbyState.WHITE_PLAYER_TURN ? this.blackPlayer : this.whitePlayer);
        if (!sender || sender === other) // Anti-cheat
          return;
        this.turn(message, sender, other);
        break;
    }
    this.next();
  }
};
