import { writeFileSync } from 'fs';

export const NON_PLOT_MASK = (1 << 7) - 1;

export enum CoffeeCellData {
  NORTH = 1,
  WEST = 1 << 1,
  SOUTH = 1 << 2,
  EAST = 1 << 3,

  FOREST = 1 << 5,
  SEA = 1 << 6,

  IMMUTABLE = FOREST | SEA
}

export class CoffeeMapInstance {
  private readonly placed: number[];
  private _accessibleCells: ReadonlySet<number> | null = null;

  private lastAddedPlot: number | null = null;
  private added: [number, number, number] | null = null;

  public constructor(
    public readonly data: CoffeeMap
  ) {
    const accessibleCells = new Set<number>();
    this.placed = Array(this.data.cells.length);
    for (let i = 0; i < this.data.cells.length; i++) {
      const x = this.data.cells[i];
      this.placed[i] = 0;
      if (!(x & CoffeeCellData.IMMUTABLE))
        accessibleCells.add(i);
    }
    this._accessibleCells = accessibleCells;
    // writeFileSync('debug_' + Date.now() + '_init.ppm', this.save());
  }

  public get accessibleCells() {
    if (this._accessibleCells)
      return this._accessibleCells;
    // return (this._accessibleCells = this.map.cells.filter(x => !(x & CoffeeCellData.IMMUTABLE)).map((_, i) => i));
    if (!this.added)
      throw new Error('"added" AND "_accessibleCells" ARE NULL !!!');
    try {
      const [Ay, Ax, Aplot] = this.added;
      const accessibleCells = new Set<number>();
      for (let i = 0; i < this.data.cells.length; i++) {
        const x = this.data.cells[i];
        if (!((x & CoffeeCellData.IMMUTABLE) || this.placed[i])) {
          const By = (i / this.data.width) | 0, Bx = i % this.data.width, Bplot = x >> 7;
          if (
            Aplot !== Bplot && // R3
            (Ay === By || Ax == Bx) && // R2
            (this.lastAddedPlot === null || this.lastAddedPlot !== Bplot) // R4
          )
            accessibleCells.add(i);
        }
      }
      return (this._accessibleCells = accessibleCells);
    } finally {
      // writeFileSync('debug_' + Date.now() + '.ppm', this.save());
    }
  }

  public canPlay(): boolean {
    return !!this.accessibleCells.size;
  }

  public add(cell: string | number, team: boolean): boolean {
    if (typeof cell === 'string')
      cell = this.data.decode(cell);
    // console.error('Trying to add a beam on cell n°%d.\nAccessible cells : %s', cell, [...this.accessibleCells].join(' '));
    if (this.accessibleCells.has(cell)) {
      this.placed[cell] = team ? 1 : -1;
      this._accessibleCells = null;
      if (this.added)
        this.lastAddedPlot = this.added[2];
      this.added = [
        (cell / this.data.width) | 0, // y
        cell % this.data.width,       // x
        this.data.cells[cell] >> 7    // plot
      ];
      return true;
    }
    return false;
  }

  public save() {
    const
      SEA_TILE = (plot: number) => `0 0 ${plot}`,
      FOREST_TILE = (plot: number) => `0 ${plot} 0`,
      ACCESSIBLE_TILE = (plot: number) => `${plot} 0 0`,
      CELL_TILE = (value: number) => `${value} ${value} ${value}`;
    const accessible = this._accessibleCells || new Set();
    let result = `P3\n${this.data.width} ${this.data.height}\n${this.data.plotCount}\n`;
    for (let i = 0; i < this.data.area; i++) {
      const value = this.data.cells[i];
      result += (!(value & CoffeeCellData.SEA) ? !(value & CoffeeCellData.FOREST) ? accessible.has(i)
        ? ACCESSIBLE_TILE(this.data.plotCount)
        : CELL_TILE(value >> 7)
        : FOREST_TILE(this.data.plotCount)
        : SEA_TILE(this.data.plotCount)) + ' ';
    }
    return result;
  }
}

export const DEFAULT_WIDTH = 10;
export const DEFAULT_HEIGHT = 10;
export const DEFAULT_PLOT_COUNT = 10;

// export const PLOT_SHAPES: readonly (readonly number[])[] = [
//   // Assume shapes width and height lower than 10

//   // 2 cells
//   [0, 1],
//   [0, 10],

//   // 3 cells
//   [0, 1, 2],
//   [0, 1, 11],
//   [0, 10, 11],
//   [0, 10, 20],

//   // 6 cells
//   [0, 1, 2, 12, 11, 10]
// ];

const PPM_SEA_TILE = (value: string, noPlots: number) => value === `0 0 ${noPlots}`;
const PPM_FOREST_TILE = (value: string, noPlots: number) => value === `0 ${noPlots} 0`;
const PPM_CELLS_TILE = (value: string) => {
  const result: RegExpExecArray | null = /(\d+)\s\1\s\1/.exec(value);
  if (result)
    return Number(result[1]);
  return null;
};

export const SIMPLIFIED_MODE_PLOT_MAP = 'abcdeghijklnopqrstuvwxyzABCDEGHIJKLNOPQRSTUVWXYZ'.split('');

export default class CoffeeMap {
  public static fromPPM(
    data: string
  ): CoffeeMap {
    const splited = data.split(/\s/).filter(x => x.length);
    if (splited.shift() !== 'P3' || (splited.length % 3) || splited.length <= 3)
      throw new Error('Malformed PPM image');
    const
      width = Number(splited.shift()),
      height = Number(splited.shift()),
      plotCount = Number(splited.shift());
    const cells: number[] = Array(width * height);
    for (let i = 3, id = 0; splited.length > 0; i += 3, id++) {
      const encoded = `${splited.shift()} ${splited.shift()} ${splited.shift()}`;
      let value = !PPM_SEA_TILE(encoded, plotCount) ? !PPM_FOREST_TILE(encoded, plotCount)
        ? 0
        : CoffeeCellData.FOREST
        : CoffeeCellData.SEA;
      if (!value) { // A normal cell
        const data = PPM_CELLS_TILE(encoded);
        if (data === null)
          throw new Error('Malformed PPM image');
        value = data << 7;
      }
      cells[id] = value;
    }
    return new CoffeeMap(cells, plotCount, width, height);
  }

  private preparedData: string;
  private preparedSimplifiedData: string;

  public readonly area: number;

  public constructor(
    public readonly cells: readonly number[],
    public readonly plotCount: number,
    public readonly width: number,
    public readonly height: number = cells.length / width,
  ) {
    this.area = cells.length;
  }

  public instanciate() {
    return new CoffeeMapInstance(this);
  }

  public decode(cell: string): number {
    const match = /([A-Z]):(\d+)/.exec(cell);
    if (!match)
      throw new Error('Invalid coordinate format');
    const [, column, row] = match;
    const
      x = column.charCodeAt(0) - 65, // 65 -> A
      y = Number(row) - 1;
    if (x < 0 || x >= this.width || y < 0 || y >= this.height)
      throw new Error('Coordinate outside the grid');
    // return x * this.width + y;
    return y * this.width + x;
  }

  public prepare(simplified: boolean) {
    if (simplified && this.preparedSimplifiedData)
      return this.preparedSimplifiedData;
    else if (!simplified && this.preparedData)
      return this.preparedData;
    const DIRECTIONS = [
      -this.width, // North
      -1,          // West
      this.width,  // South
      1            // East
    ];
    let line: (string | number)[] = [], result = '';
    for (let id = 0; id < this.area; id++) {
      const data = this.cells[id];
      if (simplified)
        switch (data) {
          case CoffeeCellData.SEA:
            line.push('M');
            break;
          case CoffeeCellData.FOREST:
            line.push('F');
            break;

          default:
            line.push(SIMPLIFIED_MODE_PLOT_MAP[data >> 7]);
            break;
        }
      else
        line.push(DIRECTIONS.reduce((acc, dir, index) => {
          const destId = id + dir;
          if (
            ( // Outside the grid
              destId < 0 ||
              destId >= this.cells.length
            ) ||
            ( // Side effect of a 1 dimensional array : cells on the side loop to the other side
              ((destId / this.width) | 0) - ((dir / this.width) | 0)) !== (((id / this.width) | 0)
            ) ||
            ( // Not the same plot or kind (`data >> 7` : plot & `(data >> 5) & 3` : kind)
              (this.cells[destId] >> 5) !== (data >> 5)
            )
          )
            acc += 1 << index; // Add a wall to the direction n°`index`
          return acc;
        }, this.cells[id] & CoffeeCellData.IMMUTABLE));
      if (!((id + 1) % this.width)) {
        result += `${line.join(':')}|`;
        line = [];
      }
    }
    if (simplified)
      this.preparedSimplifiedData = result;
    else
      this.preparedData = result;
    return result;
  }

  public toString() {
    return this.cells.map((x, i) => (!(i % this.width) ? '\n' : '') + ((x & CoffeeCellData.IMMUTABLE) ? '#' : ' ')).join('');
  }
}