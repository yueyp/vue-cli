const inquirer = require('inquirer')
const { error } = require('@vue/cli-shared-utils')

const Upgrader = require('./Upgrader')
const confirmIfGitDirty = require('./util/confirmIfGitDirty')

async function upgrade (packageName, options, context = process.cwd()) {
  // 判断是否有未提交文件
  if (!(await confirmIfGitDirty(context))) {
    return
  }
  const upgrader = new Upgrader(context)

  // 没有指定具体的npm包名称
  if (!packageName) {
    // 目标版本
    if (options.to) {
      error(`Must specify a package name to upgrade to ${options.to}`)
      process.exit(1)
    }
    // 是否全部进行升级
    if (options.all) {
      return upgrader.upgradeAll(options.next)
    }

    // 查找可以进行升级的npm包
    const upgradable = await upgrader.checkForUpdates(options.next)
    if (upgradable) {
      // 询问是否升级这些包
      const { ok } = await inquirer.prompt([
        {
          name: 'ok',
          type: 'confirm',
          message: 'Continue to upgrade these plugins?',
          default: true
        }
      ])
      // 允许升级的话则升级这些可以升级的包
      if (ok) {
        return upgrader.upgradeAll(options.next)
      }
    }

    return
  }
  // 升级指定的包
  return upgrader.upgrade(packageName, options)
}

module.exports = (...args) => {
  return upgrade(...args).catch(err => {
    error(err)
    if (!process.env.VUE_CLI_TEST) {
      process.exit(1)
    }
  })
}
