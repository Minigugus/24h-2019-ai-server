/**
 * Generate a playable map randomly as a PPM image.
 * @param {number} sea Frequence of Sea cells
 * @param {number} forest Frequence of Forest cells
 * @param {number} normal Frequence of Normal, playables cells
 * @param {number?} maxPlotsCount Max number of different plots (important for the image generation)
 */
function generateMap(sea, forest, normal, maxPlotsCount = 17) {
  const WIDTH = 10, HEIGHT = 10, NB_CELLS = WIDTH * HEIGHT;
  const SEA_TILE = `0 0 ${maxPlotsCount}`, FOREST_TILE = `0 ${maxPlotsCount} 0`, CELL_TILE = plot => `${plot} ${plot} ${plot}`;
  const PROBA_TOTAL = sea + forest + normal;
  const DIRECTIONS = [-1, -WIDTH], PLOTS = new Map(), cells = Array(NB_CELLS);
  let nextPlotNo = 1, result = `P3\n${WIDTH} ${HEIGHT}\n${maxPlotsCount}\n`;
  for (let i = 0; i < NB_CELLS; i++) {
    const value = Math.random() * PROBA_TOTAL;
    switch (value >= sea ? value >= sea + forest ? 'CELL' : 'FOREST' : 'SEA') {
      case 'CELL':
        const plot = nextPlotNo <= maxPlotsCount ? (
          cells[i] = (
            DIRECTIONS
              .reduce((acc, x) => (
                !acc &&
                  ((((i + x) / WIDTH) | 0) === ((i / WIDTH) | 0) + ((x / WIDTH) | 0)) &&
                  cells[i + x] &&
                  (!PLOTS.has(cells[i + x]) || PLOTS.get(cells[i + x]) < 6)
                  ? cells[i + x]
                  : acc
              ), 0) || nextPlotNo++
          )
        ) : nextPlotNo;
        PLOTS.set(plot, (PLOTS.get(plot) || 0) + 1);
        result += CELL_TILE(plot);
        break;
      case 'FOREST':
        result += FOREST_TILE;
        break;
      case 'SEA':
        result += SEA_TILE;
        break;
    }
    result += ' ';
  }
  return result;
}

console.info(generateMap(40, 30, 100));

// TIP : Redirect the output of this program to a `.ppm` file to view the image.
