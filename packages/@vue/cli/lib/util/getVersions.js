const { semver } = require('@vue/cli-shared-utils')
const PackageManager = require('./ProjectPackageManager')
const { loadOptions, saveOptions } = require('../options')

let sessionCached
const pm = new PackageManager()

module.exports = async function getVersions () {
  if (sessionCached) {
    return sessionCached
  }
  // latest、local用于判断@vue/cli是否需要更新以及初始化项目中相关插件的版本
  // 远程CLI以及插件的版本
  let latest
  // 本地CLI以及插件的版本
  const local = require(`../../package.json`).version
  if (process.env.VUE_CLI_TEST || process.env.VUE_CLI_DEBUG) {
    return (sessionCached = {
      current: local,
      latest: local,
      latestMinor: local
    })
  }

  // should also check for prerelease versions if the current one is a prerelease
  const includePrerelease = !!semver.prerelease(local)

  const { latestVersion = local, lastChecked = 0 } = loadOptions()
  const cached = latestVersion
  const daysPassed = (Date.now() - lastChecked) / (60 * 60 * 1000 * 24)

  let error
  if (daysPassed > 1) {
    // if we haven't check for a new version in a day, wait for the check
    // before proceeding
    try {
      latest = await getAndCacheLatestVersion(cached, includePrerelease)
    } catch (e) {
      latest = cached
      error = e
    }
  } else {
    // Otherwise, do a check in the background. If the result was updated,
    // it will be used for the next 24 hours.
    // don't throw to interrupt the user if the background check failed
    getAndCacheLatestVersion(cached, includePrerelease).catch(() => {})
    latest = cached
  }

  // if the installed version is updated but the cache doesn't update
  if (semver.gt(local, latest) && !semver.prerelease(local)) {
    latest = local
  }

  let latestMinor = `${semver.major(latest)}.${semver.minor(latest)}.0`
  if (
    // if the latest version contains breaking changes
    /major/.test(semver.diff(local, latest)) ||
    // or if using `next` branch of cli
    (semver.gte(local, latest) && semver.prerelease(local))
  ) {
    // fallback to the local cli version number
    latestMinor = local
  }

  return (sessionCached = {
    current: local,
    latest,
    latestMinor,
    error
  })
}

/**
 * 取 CLI 的版本并不是直接获取， 而是通过 vue-cli-version-marker npm 包获取的 CLI 版本，为什么会这样做，主要原因有两点：
 * 1、vue-cli 从 3.0（@vue/cli） 开始就放在了 @vue 下面，即是一个 scoped package, 而 scoped package 又不支持通过 npm registry 来获取 latest 版本信息。比如 vue-cli-version-marker/latest可以正常访问，而 @vue/cli/latest 则不可以。
 * 2、获取 scoped packages 的数据比获取 unscoped package 通常要慢 300ms。
 * */

// fetch the latest version and save it on disk
// so that it is available immediately next time
async function getAndCacheLatestVersion (cached, includePrerelease) {
  let version = await pm.getRemoteVersion('vue-cli-version-marker', 'latest')

  if (includePrerelease) {
    const next = await pm.getRemoteVersion('vue-cli-version-marker', 'next')
    version = semver.gt(next, version) ? next : version
  }

  if (semver.valid(version) && version !== cached) {
    saveOptions({ latestVersion: version, lastChecked: Date.now() })
    return version
  }
  return cached
}
