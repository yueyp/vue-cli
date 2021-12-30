const fs = require('fs')
const path = require('path')
const {
  chalk,
  execa,
  semver,

  log,
  done,
  logWithSpinner,
  stopSpinner,

  isPlugin,
  resolvePluginId,

  loadModule,
  resolveModule
} = require('@vue/cli-shared-utils')

// 版本号比较，取较大的版本号
const tryGetNewerRange = require('./util/tryGetNewerRange')
// 获取package.json的内容
const getPkg = require('./util/getPkg')
// npm包管理
const PackageManager = require('./util/ProjectPackageManager')

// 清除模块缓存，第一次加载某个缓存时，Node会缓存该模块，以后再加载该模块，就直接从缓存require.cache中拿
function clearRequireCache () {
  Object.keys(require.cache).forEach(key => delete require.cache[key])
}
module.exports = class Upgrader {
  constructor (context = process.cwd()) {
    this.context = context
    // 保存package.json的内容
    this.pkg = getPkg(this.context)
    // 创建一个包管理对象
    this.pm = new PackageManager({ context })
  }

  // 批量升级npm包
  async upgradeAll (includeNext) {
    // TODO: should confirm for major version upgrades
    // for patch & minor versions, upgrade directly
    // for major versions, prompt before upgrading
    // 判断哪些npm包可以进行升级（包括alpha/beta/rc版本在内）
    const upgradable = await this.getUpgradable(includeNext)

    // 所有的npm包都是最新的，没有可以升级的
    if (!upgradable.length) {
      done('Seems all plugins are up to date. Good work!')
      return
    }

    // 循环可以升级的包
    for (const p of upgradable) {
      // reread to avoid accidentally writing outdated package.json back
      this.pkg = getPkg(this.context)
      // 依次进行升级
      await this.upgrade(p.name, { to: p.latest })
    }

    done('All plugins are up to date!')
  }

  // 升级npm包
  async upgrade (pluginId, options) {
    // 解析出包名
    const packageName = resolvePluginId(pluginId)

    let depEntry, required
    for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (this.pkg[depType] && this.pkg[depType][packageName]) {
        depEntry = depType
        // 解析出需要升级的包版本
        required = this.pkg[depType][packageName]
        break
      }
    }
    // 若没有解析出来，则说明不存在
    if (!required) {
      throw new Error(`Can't find ${chalk.yellow(packageName)} in ${chalk.yellow('package.json')}`)
    }

    // 判断插件是从哪个版本升级
    const installed = options.from || this.pm.getInstalledVersion(packageName)

    // 不存在则抛出错误
    if (!installed) {
      throw new Error(
        `Can't find ${chalk.yellow(packageName)} in ${chalk.yellow('node_modules')}. Please install the dependencies first.\n` +
        `Or to force upgrade, you can specify your current plugin version with the ${chalk.cyan('--from')} option`
      )
    }

    // 要升级到的指定版本，没有指定则升级到最新版本
    let targetVersion = options.to || 'latest'
    // if the targetVersion is not an exact version
    // 判断版本号是否符合格式
    if (!/\d+\.\d+\.\d+/.test(targetVersion)) {
      if (targetVersion === 'latest') {
        logWithSpinner(`Getting latest version of ${packageName}`)
      } else {
        logWithSpinner(`Getting max satisfying version of ${packageName}@${options.to}`)
      }

      // 获取该npm包的版本
      targetVersion = await this.pm.getRemoteVersion(packageName, targetVersion)
      // 如果没有指定版本并且版本检查包括 alpha/beta/rc 版本在内
      if (!options.to && options.next) {
        const next = await this.pm.getRemoteVersion(packageName, 'next')
        if (next) {
          // targetVersion >= next的话取targetVersion，反之取next
          targetVersion = semver.gte(targetVersion, next) ? targetVersion : next
        }
      }
      stopSpinner()
    }

    // 如果目标版本是已经安装的版本
    if (targetVersion === installed) {
      log(`Already installed ${packageName}@${targetVersion}`)
      // 取较大的版本号
      const newRange = tryGetNewerRange(`~${targetVersion}`, required)
      if (newRange !== required) {
        this.pkg[depEntry][packageName] = newRange
        fs.writeFileSync(path.resolve(this.context, 'package.json'), JSON.stringify(this.pkg, null, 2))
        log(`${chalk.green('✔')}  Updated version range in ${chalk.yellow('package.json')}`)
      }
      return
    }

    log(`Upgrading ${packageName} from ${installed} to ${targetVersion}`)
    // 执行升级
    await this.pm.upgrade(`${packageName}@~${targetVersion}`)

    // The cached `pkg` field won't automatically update after running `this.pm.upgrade`.
    // Also, `npm install pkg@~version` won't replace the original `"pkg": "^version"` field.
    // So we have to manually update `this.pkg` and write to the file system in `runMigrator`

    this.pkg[depEntry][packageName] = `~${targetVersion}`

    const resolvedPluginMigrator =
      resolveModule(`${packageName}/migrator`, this.context)

    if (resolvedPluginMigrator) {
      // for unit tests, need to run migrator in the same process for mocks to work
      // TODO: fix the tests and remove this special case
      if (process.env.VUE_CLI_TEST) {
        clearRequireCache()
        await require('./migrate').runMigrator(
          this.context,
          {
            id: packageName,
            apply: loadModule(`${packageName}/migrator`, this.context),
            baseVersion: installed
          },
          this.pkg
        )
        return
      }

      const cliBin = path.resolve(__dirname, '../bin/vue.js')
      // Run migrator in a separate process to avoid all kinds of require cache issues
      await execa('node', [cliBin, 'migrate', packageName, '--from', installed], {
        cwd: this.context,
        stdio: 'inherit'
      })
    }
  }

  async getUpgradable (includeNext) {
    const upgradable = []

    // get current deps
    // filter @vue/cli-service, @vue/cli-plugin-* & vue-cli-plugin-*
    for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, range] of Object.entries(this.pkg[depType] || {})) {
        if (name !== '@vue/cli-service' && !isPlugin(name)) {
          continue
        }

        const installed = await this.pm.getInstalledVersion(name)
        const wanted = await this.pm.getRemoteVersion(name, range)

        if (!installed) {
          throw new Error(`At least one dependency can't be found. Please install the dependencies before trying to upgrade`)
        }

        let latest = await this.pm.getRemoteVersion(name)
        if (includeNext) {
          const next = await this.pm.getRemoteVersion(name, 'next')
          if (next) {
            latest = semver.gte(latest, next) ? latest : next
          }
        }

        if (semver.lt(installed, latest)) {
          // always list @vue/cli-service as the first one
          // as it's depended by all other plugins
          if (name === '@vue/cli-service') {
            upgradable.unshift({ name, installed, wanted, latest })
          } else {
            upgradable.push({ name, installed, wanted, latest })
          }
        }
      }
    }

    return upgradable
  }

  async checkForUpdates (includeNext) {
    logWithSpinner('Gathering package information...')
    const upgradable = await this.getUpgradable(includeNext)
    stopSpinner()

    if (!upgradable.length) {
      done('Seems all plugins are up to date. Good work!')
      return
    }

    // format the output
    // adapted from @angular/cli
    const names = upgradable.map(dep => dep.name)
    let namePad = Math.max(...names.map(x => x.length)) + 2
    if (!Number.isFinite(namePad)) {
      namePad = 30
    }
    const pads = [namePad, 16, 16, 16, 0]
    console.log(
      '  ' +
      ['Name', 'Installed', 'Wanted', 'Latest', 'Command to upgrade'].map(
        (x, i) => chalk.underline(x.padEnd(pads[i]))
      ).join('')
    )
    for (const p of upgradable) {
      const fields = [
        p.name,
        p.installed || 'N/A',
        p.wanted,
        p.latest,
        `vue upgrade ${p.name}${includeNext ? ' --next' : ''}`
      ]
      // TODO: highlight the diff part, like in `yarn outdated`
      console.log('  ' + fields.map((x, i) => x.padEnd(pads[i])).join(''))
    }

    return upgradable
  }
}
