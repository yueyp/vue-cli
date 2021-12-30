const fs = require('fs-extra')
const path = require('path')
const inquirer = require('inquirer')
const Creator = require('./Creator')
const { clearConsole } = require('./util/clearConsole')
const { getPromptModules } = require('./util/createTools')
const { chalk, error, stopSpinner, exit } = require('@vue/cli-shared-utils')
const validateProjectName = require('validate-npm-package-name')

async function create (projectName, options) {
  if (options.proxy) {
    process.env.HTTP_PROXY = options.proxy
  }
  // 获取当前目录
  const cwd = options.cwd || process.cwd()
  // 如果项目名称为"."
  const inCurrent = projectName === '.'
  // 如果项目名称为".",则取名称为上一级目录的名字，否则则取输入的项目名字
  const name = inCurrent ? path.relative('../', cwd) : projectName
  // 项目存放目录
  const targetDir = path.resolve(cwd, projectName || '.')
  // 判断项目名称是否符合要求
  const result = validateProjectName(name)
  if (!result.validForNewPackages) {
    console.error(chalk.red(`Invalid project name: "${name}"`))
    result.errors && result.errors.forEach(err => {
      console.error(chalk.red.dim('Error: ' + err))
    })
    result.warnings && result.warnings.forEach(warn => {
      console.error(chalk.red.dim('Warning: ' + warn))
    })
    exit(1)
  }
  // 如果当前目录存在,并且输入的选项中没有合并参数
  if (fs.existsSync(targetDir) && !options.merge) {
    // 强制覆盖
    if (options.force) {
      await fs.remove(targetDir)
    } else {
      // 清除了打印信息
      await clearConsole()
      // 如果是当前目录,提示是否创建新的项目到当前目录
      if (inCurrent) {
        const { ok } = await inquirer.prompt([
          {
            name: 'ok',
            type: 'confirm',
            message: `Generate project in current directory?`
          }
        ])
        if (!ok) {
          return
        }
      } else {
        // 如果已有同名项目,选择覆盖\合并或者取消
        const { action } = await inquirer.prompt([
          {
            name: 'action',
            type: 'list',
            message: `Target directory ${chalk.cyan(targetDir)} already exists. Pick an action:`,
            choices: [
              { name: 'Overwrite', value: 'overwrite' },
              { name: 'Merge', value: 'merge' },
              { name: 'Cancel', value: false }
            ]
          }
        ])
        if (!action) {
          return
        } else if (action === 'overwrite') {
          // 用户选择了重写
          console.log(`\nRemoving ${chalk.cyan(targetDir)}...`)
          await fs.remove(targetDir)
        }
      }
    }
  }

  // 新建一个创建项目的类
  // getPromptModules() 获取了 babel，typescript，pwa，router，vuex， cssPreprocessors，linter，unit，e2e 的 Prompt 的配置信息
  const creator = new Creator(name, targetDir, getPromptModules())
  await creator.create(options)
}

module.exports = (...args) => {
  return create(...args).catch(err => {
    stopSpinner(false) // do not persist
    error(err)
    if (!process.env.VUE_CLI_TEST) {
      process.exit(1)
    }
  })
}
