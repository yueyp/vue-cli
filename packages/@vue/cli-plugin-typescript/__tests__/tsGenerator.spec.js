const generateWithPlugin = require('@vue/cli-test-utils/generateWithPlugin')

test('generate files', async () => {
  const { files } = await generateWithPlugin([
    {
      id: 'core',
      apply: require('@vue/cli-service/generator'),
      options: {}
    },
    {
      id: 'ts',
      apply: require('../generator'),
      options: {}
    }
  ])

  expect(files['src/main.ts']).toBeTruthy()
  expect(files['src/main.js']).toBeFalsy()
  expect(files['src/App.vue']).toMatch('<script lang="ts">')
  // checks that the HomeView.vue file has not been created, even empty
  expect(Object.prototype.hasOwnProperty.call(files, 'src/views/HomeView.vue')).toBeFalsy()
})

test('classComponent', async () => {
  const { pkg, files } = await generateWithPlugin([
    {
      id: 'ts',
      apply: require('../generator'),
      options: {
        classComponent: true
      }
    }
  ])

  expect(pkg.dependencies).toHaveProperty('vue-class-component')
  expect(pkg.dependencies).toHaveProperty('vue-property-decorator')

  expect(files['tsconfig.json']).toMatch(`"experimentalDecorators": true`)
  expect(files['src/App.vue']).toMatch(
    `export default class App extends Vue {`
  )
  expect(files['src/components/HelloWorld.vue']).toMatch(
    `export default class HelloWorld extends Vue {`
  )
})

test('use with Babel', async () => {
  const { files } = await generateWithPlugin([
    {
      id: 'babel',
      apply: require('@vue/cli-plugin-babel/generator'),
      options: {}
    },
    {
      id: 'ts',
      apply: require('../generator'),
      options: {
        useTsWithBabel: true
      }
    }
  ])

  expect(files['babel.config.js']).toMatch(`presets: [\n    '@vue/cli-plugin-babel/preset'\n  ]`)
  expect(files['tsconfig.json']).toMatch(`"target": "esnext"`)
})

test('use with router', async () => {
  const tsApply = require('../generator')

  expect(tsApply.after).toBe('@vue/cli-plugin-router')

  const { files } = await generateWithPlugin([
    {
      id: '@vue/cli-service',
      apply: require('@vue/cli-service/generator'),
      options: {
        plugins: {
          '@vue/cli-service': {},
          '@vue/cli-plugin-router': {},
          '@vue/cli-plugin-typescript': {}
        }
      }
    },
    {
      id: '@vue/cli-plugin-typescript',
      apply: tsApply,
      options: {}
    },
    {
      id: '@vue/cli-plugin-router',
      apply: require('@vue/cli-plugin-router/generator'),
      options: {}
    }
  ])
  expect(files['src/views/HomeView.vue']).toMatch('Welcome to Your Vue.js + TypeScript App')
})

test('tsconfig.json should be valid json', async () => {
  const { files } = await generateWithPlugin([
    {
      id: 'ts',
      apply: require('../generator'),
      options: {}
    }
  ])
  expect(() => {
    JSON.parse(files['tsconfig.json'])
  }).not.toThrow()
  expect(files['tsconfig.json']).not.toMatch('"  ')
})

test('compat with unit-mocha', async () => {
  const { pkg, files } = await generateWithPlugin([
    {
      id: '@vue/cli-plugin-unit-mocha',
      apply: require('@vue/cli-plugin-unit-mocha/generator'),
      options: {}
    },
    {
      id: '@vue/cli-plugin-typescript',
      apply: require('../generator'),
      options: {
        lint: true,
        lintOn: ['save', 'commit']
      }
    }
  ])

  expect(pkg.devDependencies).toHaveProperty('@types/mocha')
  expect(pkg.devDependencies).toHaveProperty('@types/chai')

  expect(files['tsconfig.json']).not.toMatch('"  ')
})

test('compat with unit-jest', async () => {
  const { pkg, files } = await generateWithPlugin([
    {
      id: '@vue/cli-plugin-unit-jest',
      apply: require('@vue/cli-plugin-unit-jest/generator'),
      options: {}
    },
    {
      id: '@vue/cli-plugin-typescript',
      apply: require('../generator'),
      options: {
        lint: true,
        lintOn: ['save', 'commit']
      }
    }
  ])

  expect(pkg.devDependencies).toHaveProperty('@types/jest')

  expect(files['tsconfig.json']).not.toMatch('"  ')
})
