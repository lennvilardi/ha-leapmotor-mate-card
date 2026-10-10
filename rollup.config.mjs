import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

export default {
  input: 'src/leapmotor-card.ts',
  output: {
    file: 'dist/leapmotor-mate-card.js',
    format: 'es',
    inlineDynamicImports: true,
    sourcemap: false,
  },
  plugins: [
    resolve(),
    json(),
    typescript({ tsconfig: './tsconfig.json', include: ['src/**/*.ts'] }),
    terser({ format: { comments: false } }),
  ],
}
