import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: './src/index.ts',
  output: {
    format: 'commonjs',
    sourcemap: 'inline',
    file: 'dist/index.js'
  },
  plugins: [
    typescript(),
    resolve()
  ],
  external: [
    'fs',
    'dgram',
    'events'
  ]
};
