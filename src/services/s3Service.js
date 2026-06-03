import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

class S3Service {
  constructor(config) {
    this.client = null
    this.config = null
    if (config) {
      this.initialize(config)
    }
  }

  initialize(config) {
    this.config = config
    this.client = new S3Client({
      region: config.region || 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    })
  }

  // 简单加密配置，用于本地存储（仅基础保护）
  encryptConfig(config) {
    try {
      const jsonStr = JSON.stringify(config)
      return btoa(jsonStr)
    } catch (e) {
      console.error('加密配置失败', e)
      return null
    }
  }

  // 解密配置
  decryptConfig(encryptedData) {
    try {
      const jsonStr = atob(encryptedData)
      return JSON.parse(jsonStr)
    } catch (e) {
      console.error('解密配置失败', e)
      return null
    }
  }

  // 保存配置到本地存储
  saveConfigToStorage(config) {
    try {
      const encrypted = this.encryptConfig(config)
      if (encrypted) {
        localStorage.setItem('s3ConfigData', encrypted)
        return true
      }
      return false
    } catch (e) {
      console.error('保存配置失败', e)
      return false
    }
  }

  // 从本地存储加载配置
  loadConfigFromStorage() {
    try {
      const encrypted = localStorage.getItem('s3ConfigData')
      if (encrypted) {
        const config = this.decryptConfig(encrypted)
        // 向后兼容迁移：确保 bucketConfigs 存在
        if (config) {
          if (!config.bucketConfigs) {
            config.bucketConfigs = {}
            if (config.buckets && config.buckets.length > 0) {
              config.buckets.forEach(name => {
                config.bucketConfigs[name] = { customDomain: '' }
              })
            } else if (config.bucket) {
              config.bucketConfigs[config.bucket] = { customDomain: '' }
            }
          }
          if (!config.currentBucket) {
            config.currentBucket = config.bucket || Object.keys(config.bucketConfigs)[0] || ''
          }
        }
        return config
      }
      return null
    } catch (e) {
      console.error('加载配置失败', e)
      return null
    }
  }

  // 测试指定存储桶的连通性
  async testBucket(bucketName) {
    if (!this.client) {
      throw new Error('S3 客户端未初始化，请先配置存储')
    }
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1
      })
      await this.client.send(command)
      return { success: true, bucketName }
    } catch (error) {
      return { success: false, bucketName, error: error.message }
    }
  }

  // 切换当前活动的存储桶（无需重建客户端）
  switchBucket(bucketName) {
    if (!this.config) {
      throw new Error('S3 服务未初始化，请先配置存储')
    }

    this.config.currentBucket = bucketName
    this.saveConfigToStorage(this.config)

    return true
  }

  // 获取当前桶的自定义域名前缀
  getCustomDomainPrefix(bucketName) {
    const bucket = bucketName || this.config?.currentBucket
    // 优先从 bucketConfigs 读取
    if (bucket && this.config?.bucketConfigs?.[bucket]?.customDomain) {
      return this.config.bucketConfigs[bucket].customDomain.trim().replace(/\/+$/, '')
    }
    // 向后兼容：尝试从旧的全局 userSettings 读取
    try {
      const settingsStr = localStorage.getItem('userSettings')
      if (settingsStr) {
        const settings = JSON.parse(settingsStr)
        if (settings && settings.customDomainPrefix) {
          return settings.customDomainPrefix.trim().replace(/\/+$/, '')
        }
      }
    } catch (e) {
      // 忽略
    }
    return null
  }

  async listObjects(prefix = '') {
    if (!this.client) {
      throw new Error('S3 客户端未初始化，请先配置存储')
    }

    try {
      // 标准化前缀，避免双斜杠问题
      const normalizedPrefix = prefix.replace(/\/+/g, '/').replace(/^\//, '')

      const command = new ListObjectsV2Command({
        Bucket: this.config.currentBucket,
        Prefix: normalizedPrefix,
        Delimiter: '/'
      })

      const response = await this.client.send(command)

      // 处理文件夹
      const folders = (response.CommonPrefixes || []).map(prefix => {
        const normalizedPrefix = prefix.Prefix.replace(/\/+/g, '/');
        return {
          key: normalizedPrefix,
          name: normalizedPrefix.split('/').filter(Boolean).pop() + '/',
          isFolder: true,
          size: 0,
          lastModified: null
        };
      })

      // 处理文件
      const files = (response.Contents || [])
        .filter(item => item.Key !== normalizedPrefix)
        .map(item => ({
          key: item.Key,
          name: item.Key.split('/').pop(),
          isFolder: false,
          size: item.Size,
          lastModified: item.LastModified
        }))

      return [...folders, ...files]
    } catch (error) {
      console.error('列出对象失败：', error)
      throw error
    }
  }

  async uploadFile(file, key) {
    if (!this.client) {
      throw new Error('S3 客户端未初始化，请先配置存储')
    }

    if (!key) {
      key = file.name
    }

    try {
      const arrayBuffer = await file.arrayBuffer();

      const command = new PutObjectCommand({
        Bucket: this.config.currentBucket,
        Key: key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: file.type
      })

      const response = await this.client.send(command)

      // 构建文件 URL，优先使用自定义域名前缀
      const customDomain = this.getCustomDomainPrefix()
      let fileUrl

      if (customDomain) {
        fileUrl = `${customDomain}/${key}`
      } else {
        fileUrl = `${this.config.endpoint}/${this.config.currentBucket}/${key}`
      }

      return {
        success: true,
        key,
        url: fileUrl,
        response
      }
    } catch (error) {
      console.error('上传文件失败：', error)
      throw error
    }
  }

  async deleteObject(key) {
    if (!this.client) {
      throw new Error('S3 客户端未初始化，请先配置存储')
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.currentBucket,
        Key: key
      })

      const response = await this.client.send(command)

      return {
        success: true,
        key,
        response
      }
    } catch (error) {
      console.error('删除对象失败：', error)
      throw error
    }
  }

  async getSignedUrl(key, expiresIn = 3600) {
    if (!this.client) {
      throw new Error('S3 客户端未初始化，请先配置存储')
    }

    try {
      // 检查是否有自定义域名前缀
      const customDomain = this.getCustomDomainPrefix()

      if (customDomain) {
        const cleanKey = key.replace(/^\/+/, '')
        return `${customDomain}/${cleanKey}`
      }

      const command = new GetObjectCommand({
        Bucket: this.config.currentBucket,
        Key: key
      })

      const signedUrl = await getSignedUrl(this.client, command, {
        expiresIn
      })

      return signedUrl
    } catch (error) {
      console.error('获取签名URL失败：', error)
      throw error
    }
  }
}

export default new S3Service()