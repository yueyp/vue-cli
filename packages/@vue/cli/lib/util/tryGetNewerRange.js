const { semver } = require('@vue/cli-shared-utils')

const leadRE = /^(~|\^|>=?)/
// 去掉~\^\>=前缀，并把x替换成0
const rangeToVersion = r => r.replace(leadRE, '').replace(/x/g, '0')

module.exports = function tryGetNewerRange (r1, r2) {
  const v1 = rangeToVersion(r1)
  const v2 = rangeToVersion(r2)
  // 判断版本号是否有效
  if (semver.valid(v1) && semver.valid(v2)) {
    // 取较大的版本号
    return semver.gt(v1, v2) ? r1 : r2
  }
}
