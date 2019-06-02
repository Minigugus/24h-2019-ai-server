import { LobbyOpponentId } from './Lobby';

export enum CoffeeCellData {
  NORTH = 1,
  WEST = 1 << 1,
  SOUTH = 1 << 2,
  EAST = 1 << 3,

  FOREST = 1 << 5,
  SEA = 1 << 6
}

export abstract class CoffeeCell {
  public constructor(public readonly id: number) { }

  public abstract serialize(): number;

  public toString(): string {
    return this.serialize().toString();
  }
}

export class CoffeePlotCell extends CoffeeCell {
  private readonly walls: number;
  private beamTeam: LobbyOpponentId = null;

  public constructor(
    id: number,
    public readonly plot: number,
    walls: [boolean, boolean, boolean, boolean]
  ) {
    super(id);
    this.walls = walls.reduce((sum, isWall, dirId) => sum + (isWall ? (1 << dirId) : 0), 0);
  }

  public get isBeamOver() {
    return this.beamTeam !== null;
  }

  public addBeam(team: LobbyOpponentId) {
    if (this.isBeamOver)
      throw new Error(`Already a beam over on cell n°${this.id} !`);
    this.beamTeam = team;
  }

  public serialize(): number {
    return this.walls;
  }
}
export class CoffeeSeaCell extends CoffeeCell {
  public serialize(): number {
    return CoffeeCellData.SEA;
  }
}
export class CoffeeForestCell extends CoffeeCell {
  public serialize(): number {
    return CoffeeCellData.FOREST;
  }
}

export default class CoffeeMap {
  private readonly cells: CoffeeCell[];
  private accessibleCells: number[];

  public readonly area: number;

  public constructor(
    public readonly width: number,
    public readonly height: number
  ) {
    this.area = width * height;
    this.cells = new Array(this.area);
    this.initialize();
  }

  private initialize() {

  }
  
  public canPlay(): boolean {
    return !!this.accessibleCells.length;
  }
}