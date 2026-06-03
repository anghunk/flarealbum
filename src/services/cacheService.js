// cacheService.js - 管理图床数据缓存
class CacheService {
  constructor() {
    this.CACHE_PREFIX = 'r2_image_hosting_';
    this.CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 延长缓存有效期为 24 小时 (毫秒)
    this.IMAGE_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 图片 URL 缓存 24 小时
    this.currentBucket = ''; // 当前活动的存储桶（用于缓存键命名空间）
    this.bucketTree = null; // 存储桶树形结构
    this.allFiles = null; // 存储所有文件的缓存

    // 从配置中初始化 currentBucket
    const config = this.loadUserConfig();
    if (config && config.currentBucket) {
      this.currentBucket = config.currentBucket;
    } else if (config && config.bucket) {
      // 向后兼容
      this.currentBucket = config.bucket;
    }

    this.loadBucketTree(); // 初始化时加载树结构
    this.loadAllFiles(); // 初始化时加载所有文件
  }

  // 获取 bucket 前缀（用于缓存键命名空间）
  getBucketPrefix() {
    return this.currentBucket ? `${this.currentBucket}_` : '';
  }

  // 设置当前活动存储桶
  setCurrentBucket(bucketName) {
    this.currentBucket = bucketName;
    // 重载内存缓存（从新 bucket 的 localStorage 键）
    this.loadBucketTree();
    this.loadAllFiles();
  }

  // 获取文件列表缓存键
  getFileListCacheKey(path) {
    return `${this.CACHE_PREFIX}${this.getBucketPrefix()}files_${path}`;
  }

  // 获取 URL 缓存键
  getUrlCacheKey() {
    return `${this.CACHE_PREFIX}${this.getBucketPrefix()}urls`;
  }

  // 获取时间戳缓存键
  getTimestampKey() {
    return `${this.CACHE_PREFIX}${this.getBucketPrefix()}timestamp`;
  }

  // 获取存储桶树结构缓存键
  getBucketTreeKey() {
    return `${this.CACHE_PREFIX}${this.getBucketPrefix()}bucket_tree`;
  }

  // 获取所有文件键
  getAllFilesKey() {
    return `${this.CACHE_PREFIX}${this.getBucketPrefix()}all_files`;
  }

  // 获取用户配置缓存键的方法
  getUserConfigKey() {
    return `${this.CACHE_PREFIX}user_config`;
  }
  
  // 获取用户设置缓存键的方法
  getUserSettingsKey() {
    return `${this.CACHE_PREFIX}user_settings`;
  }

  // 标准化路径，避免双斜杠问题
  normalizePath(path) {
    // 移除开头和结尾的斜杠，然后根据需要添加
    return path.replace(/^\/+|\/+$/g, '');
  }

  // 从 localStorage 加载树结构
  loadBucketTree() {
    try {
      const cachedTree = localStorage.getItem(this.getBucketTreeKey());
      if (cachedTree) {
        this.bucketTree = JSON.parse(cachedTree);
      } else {
        this.bucketTree = {
          name: 'root',
          path: '',
          children: [],
          files: []
        };
      }
    } catch (error) {
      console.error('加载存储桶树结构失败：', error);
      this.bucketTree = {
        name: 'root',
        path: '',
        children: [],
        files: []
      };
    }
  }

  // 保存树结构到 localStorage
  saveBucketTree() {
    try {
      localStorage.setItem(
        this.getBucketTreeKey(),
        JSON.stringify(this.bucketTree)
      );
    } catch (error) {
      console.error('保存存储桶树结构失败：', error);
      // 如果存储空间不足，清除不必要的缓存
      this.handleStorageError();
    }
  }

  // 保存文件列表缓存
  saveFileList(path, files) {
    try {
      // 标准化路径
      const normalizedPath = this.normalizePath(path);
      
      // 更新时间戳
      const now = Date.now();
      localStorage.setItem(this.getTimestampKey(), now.toString());
      
      // 保存文件列表
      localStorage.setItem(
        this.getFileListCacheKey(normalizedPath),
        JSON.stringify(files)
      );
      
      // 更新树结构
      this.updateBucketTree(normalizedPath, files);
    } catch (error) {
      console.error('保存文件列表缓存失败：', error);
      this.handleStorageError();
    }
  }

  // 加载文件列表缓存
  loadFileList(path) {
    try {
      // 标准化路径
      const normalizedPath = this.normalizePath(path);
      const cacheKey = this.getFileListCacheKey(normalizedPath);
      const cachedFiles = localStorage.getItem(cacheKey);
      return cachedFiles ? JSON.parse(cachedFiles) : null;
    } catch (error) {
      console.error(`加载路径 ${path} 的文件列表缓存失败:`, error);
      return null;
    }
  }

  // 保存文件 URL 缓存
  saveFileUrls(urlMap) {
    try {
      localStorage.setItem(this.getUrlCacheKey(), JSON.stringify(urlMap));
    } catch (error) {
      console.error('保存文件 URL 缓存失败：', error);
      this.handleStorageError();
    }
  }

  // 加载文件 URL 缓存
  loadFileUrls() {
    try {
      const cachedUrls = localStorage.getItem(this.getUrlCacheKey());
      return cachedUrls ? JSON.parse(cachedUrls) : {};
    } catch (error) {
      console.error('加载文件 URL 缓存失败：', error);
      return {};
    }
  }

  // 检查缓存是否过期
  isCacheExpired() {
    try {
      const timestamp = localStorage.getItem(this.getTimestampKey());
      if (!timestamp) return true;
      
      const cacheTime = parseInt(timestamp, 10);
      return Date.now() - cacheTime > this.CACHE_EXPIRY;
    } catch (error) {
      console.error('检查缓存过期失败：', error);
      return true;
    }
  }

  // 更新存储桶树结构
  updateBucketTree(path, files) {
    if (!this.bucketTree) {
      this.loadBucketTree();
    }

    // 标准化路径
    const normalizedPath = this.normalizePath(path);
    
    // 解析路径并查找/创建节点
    const pathParts = normalizedPath.split('/').filter(Boolean);
    let currentNode = this.bucketTree;
    
    // 遍历路径创建节点
    if (pathParts.length > 0) {
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        const currentPath = pathParts.slice(0, i + 1).join('/');
        
        // 查找子节点
        let found = false;
        for (let j = 0; j < currentNode.children.length; j++) {
          if (currentNode.children[j].name === part) {
            currentNode = currentNode.children[j];
            found = true;
            break;
          }
        }
        
        // 如果节点不存在，创建新节点
        if (!found) {
          const newNode = {
            name: part,
            path: currentPath,
            children: [],
            files: []
          };
          currentNode.children.push(newNode);
          currentNode = newNode;
        }
      }
    }
    
    // 更新当前节点的文件
    currentNode.files = files.filter(file => !file.isFolder);
    
    // 确保文件夹存在于子节点中
    files.filter(file => file.isFolder).forEach(folder => {
      // 清理文件夹名称，移除斜杠
      const folderName = folder.name.replace(/\/+/g, '');
      
      // 构建文件夹路径，避免双斜杠
      const folderPath = normalizedPath ? `${normalizedPath}/${folderName}` : folderName;
      
      // 检查子节点中是否已存在此文件夹
      let exists = false;
      for (let i = 0; i < currentNode.children.length; i++) {
        if (currentNode.children[i].name === folderName) {
          exists = true;
          break;
        }
      }
      
      // 如果不存在，添加新节点
      if (!exists) {
        currentNode.children.push({
          name: folderName,
          path: folderPath,
          children: [],
          files: []
        });
      }
    });
    
    // 保存更新后的树结构
    this.saveBucketTree();
    
    // 保存所有文件的平面列表
    this.saveAllFiles();
  }

  // 获取存储桶树结构
  getBucketTree() {
    if (!this.bucketTree) {
      this.loadBucketTree();
    }
    return this.bucketTree;
  }

  // 获取特定路径的节点
  getNodeByPath(path) {
    if (!path) return this.bucketTree;
    
    // 标准化路径
    const normalizedPath = this.normalizePath(path);
    const pathParts = normalizedPath.split('/').filter(Boolean);
    let currentNode = this.bucketTree;
    
    for (const part of pathParts) {
      let found = false;
      for (const child of currentNode.children) {
        if (child.name === part) {
          currentNode = child;
          found = true;
          break;
        }
      }
      if (!found) return null;
    }
    
    return currentNode;
  }

  // 保存所有文件的平面列表
  saveAllFiles() {
    try {
      this.allFiles = this.getAllFilesFromTree(this.bucketTree);
      localStorage.setItem(this.getAllFilesKey(), JSON.stringify(this.allFiles));
    } catch (error) {
      console.error('保存所有文件列表失败:', error);
      this.handleStorageError();
    }
  }

  // 从树结构中获取所有文件
  getAllFilesFromTree(node, allFiles = []) {
    // 添加当前节点的文件
    if (node.files && node.files.length > 0) {
      allFiles.push(...node.files);
    }
    
    // 递归处理子节点
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        this.getAllFilesFromTree(child, allFiles);
      }
    }
    
    return allFiles;
  }

  // 加载所有文件列表
  loadAllFiles() {
    try {
      const cached = localStorage.getItem(this.getAllFilesKey());
      this.allFiles = cached ? JSON.parse(cached) : [];
      return this.allFiles;
    } catch (error) {
      console.error('加载所有文件列表失败：', error);
      this.allFiles = [];
      return [];
    }
  }

  // 获取指定路径下的文件（从缓存中）
  getFilesInPath(path) {
    // 标准化路径
    const normalizedPath = this.normalizePath(path);
    
    // 先尝试从专门的路径缓存中获取
    const cachedFiles = this.loadFileList(normalizedPath);
    if (cachedFiles && cachedFiles.length > 0) {
      return cachedFiles;
    }
    
    // 如果没有专门的路径缓存，从树结构中获取
    const node = this.getNodeByPath(normalizedPath);
    if (node) {
      // 获取当前节点的文件
      const files = [...node.files];
      
      // 添加子文件夹
      node.children.forEach(child => {
        files.push({
          key: child.path + '/',
          name: child.name + '/',
          isFolder: true,
          size: 0,
          lastModified: null
        });
      });
      
      return files;
    }
    
    return [];
  }

  // 初始化或刷新整个存储桶数据
  async refreshBucketData(s3Service) {
    try {
      // 清除当前的缓存时间戳，标记为刷新模式
      localStorage.setItem(this.getTimestampKey(), Date.now().toString());
      
      // 重置树结构
      this.bucketTree = {
        name: 'root',
        path: '',
        children: [],
        files: []
      };
      
      // 清空文件 URL 缓存
      const fileUrlCache = this.loadFileUrls();
      
      // 从根目录开始递归缓存
      await this.cacheFolderRecursively('', s3Service, fileUrlCache);
      
      // 更新树结构和所有文件列表
      this.saveBucketTree();
      this.saveAllFiles();
      
      return true;
    } catch (error) {
      console.error('刷新存储桶数据失败：', error);
      return false;
    }
  }
  
  // 递归缓存文件夹
  async cacheFolderRecursively(path, s3Service, fileUrlCache = {}, depth = 0, maxDepth = 10) {
    // 防止过深递归
    if (depth > maxDepth) {
      console.warn(`达到最大递归深度 ${maxDepth}，路径：${path}`);
      return;
    }
    
    // 获取当前路径的文件列表
    const files = await s3Service.listObjects(path);
    
    // 保存到缓存
    this.saveFileList(path, files);
    
    // 预加载图片 URL
    const imageFiles = files.filter(file => !file.isFolder && this.isImageFile(file.name));

    // 检查是否有自定义域名前缀（从 per-bucket 配置读取）
    const bucketConfigs = s3Service.config?.bucketConfigs
    const currentBucket = s3Service.config?.currentBucket
    const customDomain = bucketConfigs?.[currentBucket]?.customDomain?.trim().replace(/\/+$/, '')
    // 向后兼容：如果桶配置中没有，尝试从旧的全局 userSettings 读取
    const fallbackDomain = !customDomain ? (this.loadUserSettings()?.customDomainPrefix?.trim().replace(/\/+$/, '') || null) : null
    const effectiveDomain = customDomain || fallbackDomain
    
    // 如果有自定义域名前缀，直接使用它构建 URL
    if (effectiveDomain) {
      imageFiles.forEach(file => {
        if (!fileUrlCache[file.key]) {
          const cleanKey = file.key.replace(/^\/+/, '');
          fileUrlCache[file.key] = `${effectiveDomain}/${cleanKey}`;
        }
      });
    } else {
      // 否则使用签名 URL
      await Promise.all(
        imageFiles.map(async (file) => {
          try {
            if (!fileUrlCache[file.key]) {
              const url = await s3Service.getSignedUrl(file.key, 3600 * 24); // 24 小时有效期
              fileUrlCache[file.key] = url;
            }
          } catch (error) {
            console.error(`获取文件 ${file.key} 的 URL 失败:`, error);
          }
        })
      );
    }
    
    // 保存 URL 缓存
    this.saveFileUrls(fileUrlCache);
    
    // 递归处理子文件夹
    const folders = files.filter(file => file.isFolder);
    for (const folder of folders) {
      const folderPath = folder.key;
      await this.cacheFolderRecursively(folderPath, s3Service, fileUrlCache, depth + 1, maxDepth);
    }
  }
  
  // 判断文件是否为图片
  isImageFile(filename) {
    if (!filename) return false;
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const extension = filename.split('.').pop().toLowerCase();
    return imageExtensions.includes(extension);
  }

  // 处理存储错误（通常是存储空间不足）
  handleStorageError() {
    // 优先清除 URL 缓存，因为这通常是最大的
    try {
      localStorage.removeItem(this.getUrlCacheKey());
    } catch (e) {
      // 如果还是失败，清除所有缓存
      this.clearAllCache();
    }
  }

  // 获取缓存使用统计
  getCacheStats() {
    let totalSize = 0;
    let fileCount = 0;
    let urlCount = 0;
    
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(this.CACHE_PREFIX)) {
          const value = localStorage.getItem(key);
          totalSize += (key.length + (value ? value.length : 0)) * 2; // 估计字节大小（2 字节/字符）
          
          if (key.includes('files_')) fileCount++;
          if (key === this.getUrlCacheKey()) {
            const urls = JSON.parse(value || '{}');
            urlCount = Object.keys(urls).length;
          }
        }
      });
    } catch (error) {
      console.error('获取缓存统计失败：', error);
    }
    
    return {
      totalSize: this.formatBytes(totalSize),
      fileCount,
      urlCount,
      bucketTreeSize: this.bucketTree ? 
        this.formatBytes(JSON.stringify(this.bucketTree).length * 2) : '0 B'
    };
  }

  // 格式化字节大小
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 添加保存用户配置的方法
  saveUserConfig(config) {
    try {
      localStorage.setItem(
        this.getUserConfigKey(),
        JSON.stringify(config)
      );
      return true;
    } catch (error) {
      console.error('保存用户配置失败：', error);
      this.handleStorageError();
      return false;
    }
  }

  // 添加加载用户配置的方法
  loadUserConfig() {
    try {
      const cachedConfig = localStorage.getItem(this.getUserConfigKey());
      if (cachedConfig) {
        const config = JSON.parse(cachedConfig);
        // 向后兼容迁移：确保 bucketConfigs 存在
        if (config && !config.bucketConfigs) {
          config.bucketConfigs = {};
          if (config.buckets && config.buckets.length > 0) {
            config.buckets.forEach(name => {
              config.bucketConfigs[name] = { customDomain: '' }
            })
          } else if (config.bucket) {
            config.bucketConfigs[config.bucket] = { customDomain: '' }
          }
        }
        if (config && !config.currentBucket) {
          config.currentBucket = config.bucket || Object.keys(config.bucketConfigs)[0] || ''
        }
        return config;
      }
      return null;
    } catch (error) {
      console.error('加载用户配置失败：', error);
      return null;
    }
  }

  // 添加保存用户设置的方法
  saveUserSettings(settings) {
    try {
      localStorage.setItem(
        this.getUserSettingsKey(),
        JSON.stringify(settings)
      );
      return true;
    } catch (error) {
      console.error('保存用户设置失败：', error);
      this.handleStorageError();
      return false;
    }
  }

  // 添加加载用户设置的方法
  loadUserSettings() {
    try {
      const cachedSettings = localStorage.getItem(this.getUserSettingsKey());
      return cachedSettings ? JSON.parse(cachedSettings) : null;
    } catch (error) {
      console.error('加载用户设置失败：', error);
      return null;
    }
  }

  // 清除指定存储桶的缓存
  clearBucketCache(bucketName) {
    try {
      const bucketPrefix = bucketName ? `${bucketName}_` : '';
      const fullPrefix = `${this.CACHE_PREFIX}${bucketPrefix}`;

      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(fullPrefix) &&
            !key.includes('user_config') &&
            !key.includes('user_settings')) {
          localStorage.removeItem(key);
        }
      });

      // 如果清除的是当前桶，重置内存缓存
      if (bucketName === this.currentBucket || !bucketName) {
        this.bucketTree = {
          name: 'root',
          path: '',
          children: [],
          files: []
        };
        this.allFiles = [];
      }
    } catch (error) {
      console.error('清除存储桶缓存失败：', error);
    }
  }

  // 清除所有缓存
  clearAllCache() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(this.CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
      
      // 重置内存中的树结构
      this.bucketTree = {
        name: 'root',
        path: '',
        children: [],
        files: []
      };
    } catch (error) {
      console.error('清除所有缓存失败：', error);
    }
  }
}

export default new CacheService(); 