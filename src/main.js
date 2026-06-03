import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createStore } from 'vuex'
import { createRouter, createWebHistory } from 'vue-router'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/antd.css'
import s3Service from './services/s3Service'
import cacheService from './services/cacheService'

// 引入路由配置
import routes from './router'

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes,
  // 添加 scrollBehavior 配置，确保路由切换后滚动到顶部
  scrollBehavior(to, from, savedPosition) {
    // 如果有保存的位置（例如用户点击了后退按钮），则使用保存的位置
    if (savedPosition) {
      return savedPosition
    } else {
      // 否则滚动到顶部
      return { top: 0 }
    }
  }
})

// 向后兼容迁移：将旧的 bucket/buckets 转换为 bucketConfigs
const migrateConfig = (config) => {
  if (!config) return config

  // 如果已经有 bucketConfigs，只需确保 currentBucket 存在
  if (config.bucketConfigs) {
    if (!config.currentBucket) {
      const bucketNames = Object.keys(config.bucketConfigs)
      config.currentBucket = bucketNames[0] || ''
    }
    return config
  }

  // 从旧的 bucket/buckets 迁移到 bucketConfigs
  config.bucketConfigs = {}

  if (config.buckets && config.buckets.length > 0) {
    config.buckets.forEach(name => {
      config.bucketConfigs[name] = { customDomain: '' }
    })
  } else if (config.bucket) {
    config.bucketConfigs[config.bucket] = { customDomain: '' }
  }

  // 从旧的全局 customDomainPrefix 迁移到当前桶的 customDomain
  try {
    const settingsStr = localStorage.getItem('userSettings')
    if (settingsStr) {
      const settings = JSON.parse(settingsStr)
      if (settings?.customDomainPrefix) {
        const currentBucket = config.bucket || Object.keys(config.bucketConfigs)[0]
        if (currentBucket && config.bucketConfigs[currentBucket]) {
          config.bucketConfigs[currentBucket].customDomain = settings.customDomainPrefix.trim().replace(/\/+$/, '')
        }
      }
    }
  } catch (e) {
    // 忽略迁移失败
  }

  config.currentBucket = config.bucket || Object.keys(config.bucketConfigs)[0] || ''

  return config
}

// 从本地存储加载配置
const loadConfigFromStorage = () => {
  // 优先使用 s3Service 的配置（兼容旧版本）
  const s3Config = s3Service.loadConfigFromStorage();
  if (s3Config) {
    return migrateConfig(s3Config);
  }

  // 如果 s3Service 没有配置，尝试从 cacheService 加载
  const cachedConfig = cacheService.loadUserConfig();
  if (cachedConfig) {
    return migrateConfig(cachedConfig);
  }

  return null;
}

// 从本地存储加载用户设置
const loadUserSettingsFromStorage = () => {
  // 优先从 cacheService 加载
  const cachedSettings = cacheService.loadUserSettings();
  if (cachedSettings) {
    return cachedSettings;
  }

  // 如果 cacheService 没有设置，尝试从 localStorage 加载（兼容旧版本）
  try {
    const storedSettings = localStorage.getItem('userSettings');
    return storedSettings ? JSON.parse(storedSettings) : null;
  } catch (e) {
    console.error('无法解析存储的用户设置：', e);
    return null;
  }
}

// 创建 Vuex 存储
const store = createStore({
  state() {
    const initialConfig = loadConfigFromStorage()
    const bucketConfigs = initialConfig?.bucketConfigs || {}
    const bucketNames = Object.keys(bucketConfigs)
    const currentBucket = initialConfig?.currentBucket || bucketNames[0] || ''
    return {
      s3Config: initialConfig,
      userSettings: loadUserSettingsFromStorage(),
      imageList: [],
      currentFolder: '',
      currentBucket,
      bucketConfigs,
      loading: false
    }
  },
  mutations: {
    setS3Config(state, config) {
      if (config) {
        // 向后兼容迁移
        config = migrateConfig(config)
      }

      state.s3Config = config
      state.bucketConfigs = config ? config.bucketConfigs || {} : {}
      state.currentBucket = config ? config.currentBucket || Object.keys(config.bucketConfigs || {})[0] || '' : ''

      // 如果配置有效，初始化 S3 服务
      if (config && config.endpoint && config.accessKeyId && config.secretAccessKey) {
        s3Service.initialize(config)
      }
    },
    setUserSettings(state, settings) {
      state.userSettings = settings
    },
    setImageList(state, list) {
      state.imageList = list
    },
    setCurrentFolder(state, folder) {
      state.currentFolder = folder
    },
    setCurrentBucket(state, bucketName) {
      state.currentBucket = bucketName
      // 同步更新 s3Config.currentBucket
      if (state.s3Config) {
        state.s3Config.currentBucket = bucketName
        s3Service.switchBucket(bucketName)
      }
    },
    setBucketConfigs(state, bucketConfigs) {
      state.bucketConfigs = bucketConfigs
      if (state.s3Config) {
        state.s3Config.bucketConfigs = bucketConfigs
      }
    },
    addBucketConfig(state, { bucketName, customDomain }) {
      state.bucketConfigs[bucketName] = { customDomain: customDomain || '' }
      if (state.s3Config) {
        state.s3Config.bucketConfigs[bucketName] = { customDomain: customDomain || '' }
      }
      // 如果没有 currentBucket，自动设置
      if (!state.currentBucket) {
        state.currentBucket = bucketName
        if (state.s3Config) {
          state.s3Config.currentBucket = bucketName
        }
      }
    },
    removeBucketConfig(state, bucketName) {
      delete state.bucketConfigs[bucketName]
      if (state.s3Config) {
        delete state.s3Config.bucketConfigs[bucketName]
      }
      // 如果删除的是当前桶，切换到另一个桶
      if (state.currentBucket === bucketName) {
        const remaining = Object.keys(state.bucketConfigs)
        state.currentBucket = remaining[0] || ''
        if (state.s3Config) {
          state.s3Config.currentBucket = remaining[0] || ''
        }
      }
    },
    setBucketCustomDomain(state, { bucketName, customDomain }) {
      if (state.bucketConfigs[bucketName]) {
        state.bucketConfigs[bucketName].customDomain = customDomain
      }
      if (state.s3Config?.bucketConfigs[bucketName]) {
        state.s3Config.bucketConfigs[bucketName].customDomain = customDomain
      }
    },
    setLoading(state, status) {
      state.loading = status
    }
  },
  actions: {
    // 保存配置并初始化服务
    saveConfig({ commit }, config) {
      // 保存到 Vuex
      commit('setS3Config', config)

      // 安全地保存到本地存储，包括密钥
      s3Service.saveConfigToStorage(config)

      // 同时保存到 cacheService，确保双重备份
      cacheService.saveUserConfig(config)

      return true
    },
    // 保存用户设置
    saveUserSettings({ commit }, settings) {
      // 保存到 Vuex
      commit('setUserSettings', settings)

      // 保存到 cacheService
      cacheService.saveUserSettings(settings)

      // 同时保存到 localStorage 以保持兼容性（移除旧的 customDomainPrefix）
      const settingsToSave = { ...settings }
      delete settingsToSave.customDomainPrefix // 自定义域名现在在 bucketConfigs 中
      localStorage.setItem('userSettings', JSON.stringify(settingsToSave))

      return true
    },
    // 切换当前活动存储桶
    switchBucket({ commit, state }, bucketName) {
      commit('setCurrentBucket', bucketName)

      // 持久化更新后的配置
      const updatedConfig = { ...state.s3Config, currentBucket: bucketName }
      s3Service.saveConfigToStorage(updatedConfig)
      cacheService.saveUserConfig(updatedConfig)

      // 更新 cacheService 的 currentBucket
      cacheService.setCurrentBucket(bucketName)

      return true
    },
    // 添加存储桶
    addBucket({ commit, state }, { bucketName, customDomain }) {
      commit('addBucketConfig', { bucketName, customDomain })

      // 持久化更新后的配置
      const updatedConfig = { ...state.s3Config, bucketConfigs: { ...state.bucketConfigs } }
      s3Service.saveConfigToStorage(updatedConfig)
      cacheService.saveUserConfig(updatedConfig)

      return true
    },
    // 删除存储桶
    removeBucket({ commit, state }, bucketName) {
      commit('removeBucketConfig', bucketName)

      // 持久化更新后的配置
      const updatedConfig = { ...state.s3Config, bucketConfigs: { ...state.bucketConfigs } }
      s3Service.saveConfigToStorage(updatedConfig)
      cacheService.saveUserConfig(updatedConfig)

      return true
    },
    // 更新存储桶的自定义域名
    updateBucketCustomDomain({ commit, state }, { bucketName, customDomain }) {
      commit('setBucketCustomDomain', { bucketName, customDomain })

      // 持久化更新后的配置
      const updatedConfig = { ...state.s3Config, bucketConfigs: { ...state.bucketConfigs } }
      s3Service.saveConfigToStorage(updatedConfig)
      cacheService.saveUserConfig(updatedConfig)

      return true
    }
  }
})

// 初始化 S3 服务 (如果本地存储中有配置)
if (store.state.s3Config) {
  s3Service.initialize(store.state.s3Config)
}

const app = createApp(App)
app.use(router)
app.use(store)
app.use(Antd)
app.mount('#app')