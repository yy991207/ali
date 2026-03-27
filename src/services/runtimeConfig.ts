import configYamlRaw from '../../config.yaml?raw'

interface RuntimeConfig {
  token: string
  resourceId: string
  markStorageKey: string
}

type ConfigMap = Record<string, string>

const parseSimpleYaml = (rawText: string): ConfigMap => {
  return rawText.split('\n').reduce<ConfigMap>((result, rawLine) => {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes(':')) {
      return result
    }
    const [rawKey, ...rest] = line.split(':')
    result[rawKey.trim()] = rest.join(':').trim().replace(/^['"]|['"]$/g, '')
    return result
  }, {})
}

const readConfigValue = (mapping: ConfigMap, keys: string[]): string => {
  for (const key of keys) {
    const value = mapping[key]
    if (value) {
      return value
    }
  }
  return ''
}

const buildRuntimeConfig = (): RuntimeConfig => {
  const mapping = parseSimpleYaml(configYamlRaw)
  const resourceId = readConfigValue(mapping, ['resourceId', 'resourceid', 'resouceid', 'resouceId', 'RESOURCE_ID'])
  const token = readConfigValue(mapping, ['X-Access-Token'])

  return {
    token,
    resourceId,
    markStorageKey: `ali:transcript-marks:${resourceId || 'default'}`
  }
}

// 这里是纯前端直连方案，token 和 resourceId 会被打进浏览器构建产物，只适合测试环境。
// 后续如果要上正式环境，必须把鉴权和配置读取迁回服务端，不能继续让浏览器直接持有 token。
export const runtimeConfig = buildRuntimeConfig()
