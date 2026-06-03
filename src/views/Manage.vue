<template>
  <div class="manage-container">
    <!-- 侧边树状结构 -->
    <a-drawer
      v-model:visible="showBucketTree"
      title="存储桶文件结构"
      placement="left"
      :width="320"
      :closable="true"
    > 
      <div style="height: 100%;display: flex; flex-direction: column;">
        <div v-if="bucketTree" class="tree-container">
          <a-tree
            :treeData="[bucketTree]"
            :fieldNames="{ title: 'name', key: 'path', children: 'children' }"
            @select="keys => navigateFromTree(cacheService.getNodeByPath(keys[0]))"
          >
            <template #title="{ name, files, children }">
              <span>
                {{ name || '根目录' }}
                <a-tag v-if="files?.length || children?.length">
                  {{ getChildCount({ files, children }) }}
                </a-tag>
              </span>
            </template>
          </a-tree>
        </div>
        
        <div class="cache-stats">
          <h4>缓存统计</h4>
          <p>
            <strong>总缓存大小：</strong> {{ cacheStats?.totalSize || '0 B' }}<br>
            <strong>缓存目录数：</strong> {{ cacheStats?.fileCount || 0 }}<br>
            <strong>缓存图片数：</strong> {{ cacheStats?.urlCount || 0 }}<br>
            <strong>树结构大小：</strong> {{ cacheStats?.bucketTreeSize || '0 B' }}
          </p>
        </div>
      </div>
    </a-drawer>
    
    <a-page-header
      title="图床管理"
      sub-title="管理您的FlareAlbum图片"
      :backIcon="false"
    >
      <template #extra>
        <a-space>
          <a-tag v-if="!loading" color="success">
            <clock-circle-outlined /> {{ cacheTimestamp ? new Date(cacheTimestamp).toLocaleString() : '无缓存' }}
          </a-tag>
          <a-button @click="toggleViewMode">
            <template #icon>
              <appstore-outlined v-if="viewMode === 'list'" />
              <unordered-list-outlined v-else />
            </template>
            {{ viewMode === 'list' ? '网格视图' : '列表视图' }}
          </a-button>
          <a-button @click="toggleBucketTree">
            <template #icon>
              <partition-outlined />
            </template>
            文件夹树
          </a-button>
          <a-button type="primary" @click="refreshFiles" :loading="loading">
            <template #icon>
              <reload-outlined />
            </template>
            刷新
          </a-button>
        </a-space>
      </template>
    </a-page-header>

    <a-card>
      <!-- 存储桶选择器 -->
      <div v-if="buckets.length > 1" style="margin-bottom: 16px">
        <a-select
          :value="currentBucket"
          @change="handleBucketChange"
          style="width: 200px"
          placeholder="选择存储桶"
        >
          <a-select-option
            v-for="bucket in buckets"
            :key="bucket"
            :value="bucket"
          >
            {{ bucket }}
          </a-select-option>
        </a-select>
      </div>

      <!-- 面包屑导航 -->
      <a-breadcrumb style="margin-bottom: 16px">
        <a-breadcrumb-item>
          <a @click="navigateTo('')">根目录</a>
        </a-breadcrumb-item>
        <a-breadcrumb-item v-for="(part, index) in breadcrumbParts" :key="index">
          <a @click="navigateTo(part.path)">{{ part.name }}</a>
        </a-breadcrumb-item>
      </a-breadcrumb>
      
      <!-- 缓存指示器 -->
      <!-- <a-alert 
        v-if="cacheTimestamp && !loading" 
        type="info" 
        show-icon 
        message="使用缓存数据" 
        description="当前显示的是本地缓存数据，点击刷新按钮获取最新数据。"
        style="margin-bottom: 16px"
      /> -->
      
      <!-- 警告提示 -->
      <a-alert 
        v-if="!checkS3Config" 
        type="warning" 
        show-icon 
        message="请先完成S3配置" 
        description="您需要先在S3配置页面中完成Cloudflare R2存储设置后才能管理文件。"
        style="margin-bottom: 16px"
      />
      
      <!-- 加载中 -->
      <div v-if="loading" class="loading-container">
        <a-spin tip="正在加载文件列表..." />
      </div>
      
      <!-- 列表视图 -->
      <a-table
        v-else-if="viewMode === 'list'"
        :columns="columns"
        :data-source="fileList"
        :pagination="{ pageSize: 10 }"
        :locale="{ emptyText: '当前目录为空' }"
        row-key="key"
        :row-class-name="(record) => deletingKeys.has(record.key) ? 'deleting-row' : ''"
      >
        <!-- 缩略图列 -->
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'thumbnail'">
            <div class="thumbnail-cell">
              <template v-if="record.isFolder">
                <folder-outlined class="folder-icon" />
              </template>
              <template v-else-if="isImageFile(record.name) && getFileUrl(record.key)">
                <div class="image-thumbnail" @click="openPreview(record)">
                  <img :src="getFileUrl(record.key)" :alt="record.name" @error="handleImageError" />
                </div>
              </template>
              <template v-else>
                <file-image-outlined v-if="isImageFile(record.name)" class="image-icon" />
                <file-outlined v-else class="file-icon" />
              </template>
            </div>
          </template>
          
          <!-- 文件名列 -->
          <template v-if="column.dataIndex === 'name'">
            <a v-if="record.isFolder" @click="openFolder(record.key)">
              {{ record.name }}
            </a>
            <span v-else-if="isImageFile(record.name)" @click="openPreview(record)" class="image-name">
              {{ record.name }}
            </span>
            <span v-else>
              {{ record.name }}
            </span>
          </template>
          
          <!-- 大小列 -->
          <template v-if="column.dataIndex === 'size'">
            {{ record.isFolder ? '-' : formatFileSize(record.size) }}
          </template>
          
          <!-- 修改时间列 -->
          <template v-if="column.dataIndex === 'lastModified'">
            {{ record.lastModified ? formatDate(record.lastModified) : '-' }}
          </template>
          
          <!-- 操作列 -->
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a-button
                v-if="!record.isFolder"
                type="link"
                size="small"
                @click="copyUrl(record.key)"
                :disabled="deletingKeys.has(record.key)"
              >
                复制链接
              </a-button>
              <a-popconfirm
                v-if="!record.isFolder"
                title="确定要删除这个文件吗?"
                @confirm="deleteFile(record.key)"
              >
                <a-button
                  type="link"
                  size="small"
                  danger
                  :disabled="deletingKeys.has(record.key)"
                  :loading="deletingKeys.has(record.key)"
                >
                  删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
      
      <!-- 网格视图 -->
      <div v-else-if="viewMode === 'grid'" class="grid-view">
        <a-row :gutter="[16, 16]">
          <!-- 文件夹 -->
          <a-col 
            v-for="item in fileList.filter(file => file.isFolder)" 
            :key="item.key"
            :xs="12" :sm="8" :md="6" :lg="4" :xl="4"
          >
            <a-card
              class="grid-card folder-card"
              @click="openFolder(item.key)"
            >
              <div class="grid-card-content">
                <folder-outlined class="grid-folder-icon" />
                <div class="grid-file-name">{{ item.name }}</div>
              </div>
            </a-card>
          </a-col>
          
          <!-- 图片文件 -->
          <a-col
            v-for="item in fileList.filter(file => !file.isFolder && isImageFile(file.name))"
            :key="item.key"
            :xs="12" :sm="8" :md="6" :lg="4" :xl="4"
          >
            <a-card
              class="grid-card image-card"
              :class="{ 'deleting-card': deletingKeys.has(item.key) }"
              @click="deletingKeys.has(item.key) ? null : openPreview(item)"
            >
              <div class="grid-card-content">
                <div class="grid-image-container">
                  <img v-if="getFileUrl(item.key)" :src="getFileUrl(item.key)" :alt="item.name" @error="handleImageError" />
                  <file-image-outlined v-else class="grid-image-icon" />
                </div>
                <div class="grid-file-name">{{ item.name }}</div>
                <div class="grid-file-info">{{ formatFileSize(item.size) }}</div>
              </div>
              <!-- 正在删除时的 loading 遮罩 -->
              <div v-if="deletingKeys.has(item.key)" class="deleting-overlay">
                <a-spin />
              </div>
              <template #actions>
                <a-button type="link" size="small" @click.stop="copyUrl(item.key)" :disabled="deletingKeys.has(item.key)">复制链接</a-button>
                <a-popconfirm
                  title="确定要删除这个文件吗?"
                  @confirm.stop="deleteFile(item.key)"
                  @click.stop
                >
                  <a-button type="link" size="small" danger :disabled="deletingKeys.has(item.key)">删除</a-button>
                </a-popconfirm>
              </template>
            </a-card>
          </a-col>
          
          <!-- 其他文件 -->
          <a-col
            v-for="item in fileList.filter(file => !file.isFolder && !isImageFile(file.name))"
            :key="item.key"
            :xs="12" :sm="8" :md="6" :lg="4" :xl="4"
          >
            <a-card
              class="grid-card file-card"
              :class="{ 'deleting-card': deletingKeys.has(item.key) }"
            >
              <div class="grid-card-content">
                <file-outlined class="grid-file-icon" />
                <div class="grid-file-name">{{ item.name }}</div>
                <div class="grid-file-info">{{ formatFileSize(item.size) }}</div>
              </div>
              <!-- 正在删除时的 loading 遮罩 -->
              <div v-if="deletingKeys.has(item.key)" class="deleting-overlay">
                <a-spin />
              </div>
              <template #actions>
                <a-button type="link" size="small" @click.stop="copyUrl(item.key)" :disabled="deletingKeys.has(item.key)">复制链接</a-button>
                <a-popconfirm
                  title="确定要删除这个文件吗?"
                  @confirm.stop="deleteFile(item.key)"
                  @click.stop
                >
                  <a-button type="link" size="small" danger :disabled="deletingKeys.has(item.key)">删除</a-button>
                </a-popconfirm>
              </template>
            </a-card>
          </a-col>
          
          <!-- 如果没有文件显示空状态 -->
          <a-col :span="24" v-if="fileList.length === 0">
            <div class="empty-container">
              <a-empty description="当前目录为空" />
            </div>
          </a-col>
        </a-row>
      </div>
    </a-card>
    
    <!-- 图片预览模态框 -->
    <a-modal
      v-model:visible="previewVisible"
      title="图片预览"
      :footer="null"
      @cancel="closePreview"
      :destroyOnClose="true"
      :maskClosable="true"
      centered
      width="800px"
    >
      <img 
        v-if="previewUrl" 
        :src="previewUrl" 
        style="width: 100%;" 
        :alt="previewImage?.name || '预览图片'" 
        @error="handleImageError"
      />
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick, h } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { 
  ReloadOutlined, 
  FolderOutlined, 
  FileOutlined,
  PictureOutlined,
  FileImageOutlined,
  ClockCircleOutlined,
  MoreOutlined,
  PartitionOutlined,
  AppstoreOutlined,
  UnorderedListOutlined
} from '@ant-design/icons-vue'
import s3Service from '../services/s3Service'
import cacheService from '../services/cacheService'

const store = useStore()
const route = useRoute()
const router = useRouter()

// 状态
const loading = ref(false)
const fileList = ref([])
const currentPath = ref('')
const previewVisible = ref(false)
const previewUrl = ref('')
const previewImage = ref(null)
const fileUrlCache = ref({}) // 缓存文件 URL
const cacheTimestamp = ref(0) // 缓存时间戳
const showBucketTree = ref(false) // 是否显示存储桶树结构
const bucketTree = ref(null) // 存储桶树结构
const cacheStats = ref(null) // 缓存统计
const viewMode = ref('grid') // 修改默认为 'grid'，即九宫格模式
const deletingKeys = ref(new Set()) // 正在删除的文件 key 集合

// 添加默认占位图
const placeholderImage = ref("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Cpath d='M100 80 L130 120 L100 160 L70 120 Z' fill='%23d9d9d9'/%3E%3Ccircle cx='100' cy='70' r='20' fill='%23d9d9d9'/%3E%3Ctext x='100' y='180' text-anchor='middle' fill='%23999' font-family='Arial' font-size='14'%3EFlareAlbum%3C/text%3E%3C/svg%3E")

// 判断文件是否为图片
const isImageFile = (filename) => {
  if (!filename) return false
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp']
  const extension = filename.split('.').pop().toLowerCase()
  return imageExtensions.includes(extension)
}

// 表格列配置
const columns = [
  {
    title: '缩略图',
    dataIndex: 'thumbnail',
    key: 'thumbnail',
    width: 80
  },
  {
    title: '文件名',
    dataIndex: 'name',
    key: 'name',
    sorter: (a, b) => {
      // 文件夹排在前面
      if (a.isFolder && !b.isFolder) return -1
      if (!a.isFolder && b.isFolder) return 1
      return a.name.localeCompare(b.name)
    },
    defaultSortOrder: 'ascend'
  },
  {
    title: '大小',
    dataIndex: 'size',
    key: 'size',
    sorter: (a, b) => a.size - b.size
  },
  {
    title: '修改日期',
    dataIndex: 'lastModified',
    key: 'lastModified',
    sorter: (a, b) => {
      if (!a.lastModified || !b.lastModified) return 0
      return new Date(a.lastModified) - new Date(b.lastModified)
    },
    defaultSortOrder: 'descend'
  },
  {
    title: '操作',
    dataIndex: 'action',
    key: 'action',
    width: 160
  }
]

// 检查 S3 配置
const checkS3Config = computed(() => {
  return !!store.state.s3Config
})

// 存储桶管理
const currentBucket = computed(() => store.state.currentBucket || '')
const buckets = computed(() => Object.keys(store.state.bucketConfigs || {}))

const handleBucketChange = async (bucketName) => {
  if (bucketName === currentBucket.value) return

  try {
    await store.dispatch('switchBucket', bucketName)

    // 重置文件列表和路径
    fileList.value = []
    currentPath.value = ''
    fileUrlCache.value = {}
    previewUrl.value = ''
    previewImage.value = null

    // 重载新桶的数据
    await loadFiles()

    message.success(`已切换到存储桶：${bucketName}`)
  } catch (error) {
    console.error('切换存储桶失败：', error)
    message.error(`切换存储桶失败：${error.message}`)
  }
}

// 生成面包屑数据
const breadcrumbParts = computed(() => {
  if (!currentPath.value) return []
  
  const parts = currentPath.value.split('/').filter(Boolean)
  const result = []
  
  let path = ''
  for (const part of parts) {
    path = path ? `${path}/${part}` : part
    result.push({
      name: part,
      path: path
    })
  }
  
  return result
})

// 格式化文件大小
const formatFileSize = (size) => {
  if (size < 1024) {
    return size + ' B'
  } else if (size < 1024 * 1024) {
    return (size / 1024).toFixed(2) + ' KB'
  } else if (size < 1024 * 1024 * 1024) {
    return (size / (1024 * 1024)).toFixed(2) + ' MB'
  } else {
    return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }
}

// 格式化日期
const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}

// 导航到指定路径
const navigateTo = (path) => {
  // 标准化路径，但保留结尾的斜杠表示目录
  currentPath.value = path
  loadFiles()
}

// 打开文件夹
const openFolder = (path) => {
  // 确保路径以斜杠结尾表示目录
  if (path.endsWith('/')) {
    currentPath.value = path.replace(/\/+$/, '/') // 确保只有一个结尾斜杠
  } else {
    currentPath.value = path + '/'
  }
  loadFiles()
}

// 加载文件列表
const loadFiles = async () => {
  if (!checkS3Config.value) {
    message.warning('请先完成 S3 配置')
    return
  }
  
  // 获取缓存时间戳
  cacheTimestamp.value = parseInt(localStorage.getItem(cacheService.getTimestampKey()) || '0', 10)
  
  // 从缓存中获取文件列表
  const cachedFiles = cacheService.getFilesInPath(currentPath.value)
  if (cachedFiles && cachedFiles.length > 0) {
    // 对文件列表进行排序：文件夹在前，非文件夹按修改时间降序排列（新的在前）
    const sortedFiles = [...cachedFiles].sort((a, b) => {
      // 文件夹排在前面
      if (a.isFolder && !b.isFolder) return -1
      if (!a.isFolder && b.isFolder) return 1
      
      // 非文件夹按修改时间降序排列（新的在前）
      if (!a.isFolder && !b.isFolder) {
        if (!a.lastModified || !b.lastModified) return 0
        return new Date(b.lastModified) - new Date(a.lastModified)
      }
      
      // 文件夹按名称排序
      return a.name.localeCompare(b.name)
    })
    
    fileList.value = sortedFiles
    
    // 加载 URL 缓存
    fileUrlCache.value = cacheService.loadFileUrls()
    
    // 加载树结构
    bucketTree.value = cacheService.getBucketTree()
    
    // 获取缓存统计
    updateCacheStats()
    
    // 检查是否需要加载缺失的图片 URL
    const imageFiles = fileList.value.filter(file => !file.isFolder && isImageFile(file.name))
    const missingUrls = imageFiles.filter(file => !fileUrlCache.value[file.key])
    
    // 如果有缺失的 URL，尝试加载
    if (missingUrls.length > 0) {
      await loadThumbnails(fileList.value)
    }
    
    return
  }
  
  // 如果没有缓存或缓存为空，尝试加载
  loading.value = true
  
  try {
    // 获取文件列表
    const files = await s3Service.listObjects(currentPath.value)
    
    // 对文件列表进行排序：文件夹在前，非文件夹按修改时间降序排列（新的在前）
    const sortedFiles = [...files].sort((a, b) => {
      // 文件夹排在前面
      if (a.isFolder && !b.isFolder) return -1
      if (!a.isFolder && b.isFolder) return 1
      
      // 非文件夹按修改时间降序排列（新的在前）
      if (!a.isFolder && !b.isFolder) {
        if (!a.lastModified || !b.lastModified) return 0
        return new Date(b.lastModified) - new Date(a.lastModified)
      }
      
      // 文件夹按名称排序
      return a.name.localeCompare(b.name)
    })
    
    fileList.value = sortedFiles
    
    // 保存到缓存服务
    cacheService.saveFileList(currentPath.value, sortedFiles)
    
    // 保存到本地状态
    cacheTimestamp.value = Date.now()
    
    // 预加载图片缩略图 URL
    await loadThumbnails(sortedFiles)
    
    // 更新树结构
    bucketTree.value = cacheService.getBucketTree()
    
    // 获取缓存统计
    updateCacheStats()
  } catch (error) {
    console.error('加载文件失败：', error)
    message.error(`加载失败：${error.message}`)
    fileList.value = []
  } finally {
    loading.value = false
  }
}

// 更新缓存统计
const updateCacheStats = () => {
  cacheStats.value = cacheService.getCacheStats()
}

// 预加载缩略图 URL
const loadThumbnails = async (files) => {
  const imageFiles = files.filter(file => !file.isFolder && isImageFile(file.name))

  // 从缓存加载 URL
  fileUrlCache.value = cacheService.loadFileUrls()

  // 从 per-bucket 配置读取自定义域名
  const bucketConfig = store.state.bucketConfigs?.[currentBucket.value]
  const customDomain = bucketConfig?.customDomain?.trim().replace(/\/+$/, '')

  // 如果有自定义域名前缀，直接使用它构建 URL
  if (customDomain) {
    imageFiles.forEach(file => {
      if (!fileUrlCache.value[file.key]) {
        fileUrlCache.value[file.key] = `${customDomain}/${file.key}`
      }
    })
  } else {
    // 否则使用签名 URL
    await Promise.all(
      imageFiles.map(async (file) => {
        try {
          if (!fileUrlCache.value[file.key]) {
            const url = await s3Service.getSignedUrl(file.key, 3600 * 24)
            fileUrlCache.value[file.key] = url
          }
        } catch (error) {
          console.error(`获取文件 ${file.key} 的 URL 失败:`, error)
        }
      })
    )
  }

  // 保存 URL 缓存
  cacheService.saveFileUrls(fileUrlCache.value)
}

// 获取文件缩略图 URL
const getFileUrl = (key) => {
  // 优先使用缓存中的 URL
  if (fileUrlCache.value[key]) {
    return fileUrlCache.value[key]
  }

  // 如果缓存中没有，尝试使用 per-bucket 自定义域名
  const bucketConfig = store.state.bucketConfigs?.[currentBucket.value]
  if (bucketConfig?.customDomain) {
    const domain = bucketConfig.customDomain.trim().replace(/\/+$/, '')
    const cleanKey = key.replace(/^\/+/, '')
    return `${domain}/${cleanKey}`
  }

  // 没有自定义域名也没有缓存，返回 null
  return null
}

// 刷新文件列表 (强制刷新)
const refreshFiles = async () => {
  if (!checkS3Config.value) {
    message.warning('请先完成 S3 配置')
    return
  }
  
  loading.value = true
  message.info('正在刷新存储桶数据，这可能需要一些时间...')
  
  try {
    // 刷新整个存储桶数据
    await cacheService.refreshBucketData(s3Service)
    
    // 更新状态
    bucketTree.value = cacheService.getBucketTree()
    cacheTimestamp.value = Date.now()
    
    // 加载当前路径的文件
    fileList.value = cacheService.getFilesInPath(currentPath.value)
    
    // 加载 URL 缓存，而不是清空它
    fileUrlCache.value = cacheService.loadFileUrls()
    
    // 获取缓存统计
    updateCacheStats()
    
    message.success('存储桶数据刷新完成！')
  } catch (error) {
    console.error('刷新数据失败：', error)
    message.error(`刷新失败：${error.message}`)
  } finally {
    loading.value = false
  }
}

// 打开预览
const openPreview = (file) => {
  previewImage.value = file
  previewUrl.value = getFileUrl(file.key)
  
  // 始终显示预览，即使 URL 为空也使用占位图
  if (!previewUrl.value) {
    previewUrl.value = placeholderImage.value
    message.warning('无法加载原图，显示占位图')
  }
  
  previewVisible.value = true
}

// 关闭预览
const closePreview = () => {
  previewVisible.value = false
}

// 复制 URL
const copyUrl = async (key) => {
  try {
    let url = fileUrlCache.value[key]

    // 如果缓存中没有，重新获取
    if (!url) {
      // 从 per-bucket 配置读取自定义域名
      const bucketConfig = store.state.bucketConfigs?.[currentBucket.value]
      const customDomain = bucketConfig?.customDomain?.trim().replace(/\/+$/, '')

      if (customDomain) {
        const cleanKey = key.replace(/^\/+/, '')
        url = `${customDomain}/${cleanKey}`
      } else {
        url = await s3Service.getSignedUrl(key)
      }

      // 保存到缓存
      fileUrlCache.value[key] = url

      // 更新 URL 缓存
      cacheService.saveFileUrls(fileUrlCache.value)
    }

    // 获取用户设置中的复制格式
    const userSettings = store.state.userSettings
    const copyFormat = userSettings?.copyFormat || 'url'
    const fileName = key.split('/').pop()

    let copyText = url

    // 根据设置的格式转换 URL
    if (copyFormat === 'markdown') {
      copyText = `![${fileName}](${url})`
    } else if (copyFormat === 'html') {
      copyText = `<img src="${url}" alt="${fileName}" />`
    }

    navigator.clipboard.writeText(copyText)
      .then(() => {
        message.success('链接已复制到剪贴板')
      })
      .catch(() => {
        message.error('复制失败，请手动复制')
        // 显示可复制的内容
        Modal.info({
          title: '请手动复制',
          content: h('div', [
            h('p', '请手动复制以下内容：'),
            h('pre', {
              style: 'background: var(--color-bg-secondary); padding: 8px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow-x: auto;'
            }, copyText)
          ])
        })
      })
  } catch (error) {
    console.error('获取文件 URL 失败：', error)
    message.error(`获取链接失败：${error.message}`)
  }
}

// 删除文件（单项 loading，不影响全局）
const deleteFile = async (key) => {
  deletingKeys.value.add(key)

  try {
    await s3Service.deleteObject(key)
    message.success('文件已删除')

    // 从 deletingKeys 中移除（成功后 item 会被从列表删除）
    deletingKeys.value.delete(key)

    // 从缓存中移除
    if (fileUrlCache.value[key]) {
      delete fileUrlCache.value[key]
      cacheService.saveFileUrls(fileUrlCache.value)
    }

    // 从当前列表中移除
    fileList.value = fileList.value.filter(file => file.key !== key)

    // 更新文件列表缓存
    cacheService.saveFileList(currentPath.value, fileList.value)

    // 更新树结构
    bucketTree.value = cacheService.getBucketTree()

    // 更新缓存统计
    updateCacheStats()
  } catch (error) {
    console.error('删除文件失败：', error)
    message.error(`删除失败：${error.message}`)
    deletingKeys.value.delete(key)
  }
}

// 切换显示树结构
const toggleBucketTree = () => {
  showBucketTree.value = !showBucketTree.value
}

// 从树结构导航
const navigateFromTree = (node) => {
  if (node) {
    navigateTo(node.path)
    if (showBucketTree.value) {
      showBucketTree.value = false
    }
  }
}

// 获取树中文件夹的子项数量
const getChildCount = (node) => {
  let count = 0
  if (node.files) count += node.files.length
  if (node.children) count += node.children.length
  return count
}

// 切换视图模式
const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'list' ? 'grid' : 'list'
  // 保存用户偏好到本地存储
  localStorage.setItem('r2_image_hosting_view_mode', viewMode.value)
}

// 获取当前桶的自定义域名前缀
const customDomainPrefix = computed(() => {
  const bucketConfig = store.state.bucketConfigs?.[currentBucket.value]
  return bucketConfig?.customDomain?.trim().replace(/\/+$/, '') || null
})

// 处理图片加载错误
const handleImageError = (event) => {
  event.target.src = placeholderImage.value
  event.target.classList.add('placeholder-image')
}

// 挂载时加载数据
onMounted(() => {
  // 初始化缓存统计
  cacheStats.value = { totalSize: '0 B', fileCount: 0, urlCount: 0, bucketTreeSize: '0 B' }
  
  // 加载树结构
  bucketTree.value = cacheService.getBucketTree()
  
  // 加载 URL 缓存
  fileUrlCache.value = cacheService.loadFileUrls()
  
  // 加载视图模式偏好
  const savedViewMode = localStorage.getItem('r2_image_hosting_view_mode')
  if (savedViewMode) {
    viewMode.value = savedViewMode
  } else {
    // 如果没有保存的偏好，设置为默认九宫格模式并保存
    viewMode.value = 'grid'
    localStorage.setItem('r2_image_hosting_view_mode', 'grid')
  }
  
  // 从 Vuex 获取当前文件夹
  if (store.state.currentFolder) {
    currentPath.value = store.state.currentFolder
  }
  
  // 加载用户设置
  if (!store.state.userSettings) {
    // 尝试从 cacheService 加载
    const cachedSettings = cacheService.loadUserSettings()
    
    if (cachedSettings) {
      // 同步到 Vuex
      store.commit('setUserSettings', cachedSettings)
    } else {
      // 最后尝试从 localStorage 加载（兼容旧版本）
      const storedSettings = localStorage.getItem('userSettings')
      
      if (storedSettings) {
        try {
          const settings = JSON.parse(storedSettings)
          // 同步到 Vuex
          store.commit('setUserSettings', settings)
        } catch (e) {
          console.error('无法解析存储的设置：', e)
        }
      }
    }
  }

  // 检查是否有 S3 配置
  if (!checkS3Config.value) {
    // 尝试从缓存加载配置
    const cachedConfig = s3Service.loadConfigFromStorage() || cacheService.loadUserConfig();
    if (cachedConfig) {
      // 更新到 Vuex
      store.dispatch('saveConfig', cachedConfig).then(() => {
        // 配置加载成功后加载文件列表
        loadFiles()
      });
    }
  } else {
    // 有配置则直接加载文件列表
    loadFiles()
  }
  
  // 获取缓存统计
  updateCacheStats()
})

// 监听 S3 配置变化，如果配置了就加载文件
watch(
  () => store.state.s3Config,
  (newConfig) => {
    if (newConfig) {
      loadFiles()
    }
  }
)
</script>

<style scoped>
.manage-container {
  max-width: 1200px;
  margin: 0 auto;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 0;
}

.thumbnail-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 50px;
}

.image-thumbnail {
  width: 50px;
  height: 50px;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.image-thumbnail img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* 占位图样式 */
.placeholder-image {
  opacity: 0.6;
  border: 1px solid var(--color-border);
}

.folder-icon {
  font-size: 24px;
  color: var(--color-text-secondary);
}

.file-icon {
  font-size: 24px;
  color: var(--color-text-secondary);
}

.image-icon {
  font-size: 24px;
  color: var(--color-text-secondary);
}

.image-name {
  cursor: pointer;
  color: var(--color-accent);
}

.image-name:hover {
  opacity: 0.7;
}

.tree-container {
  overflow: auto;
  flex: 1;
}

.cache-stats {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

/* 网格视图样式 */
.grid-view {
  padding: 4px 0; /* 减小上下内边距 */
}

.grid-card {
  height: 100%;
  margin-bottom: 6px; /* 减小卡片间距 */
}

.grid-card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  height: 140px;
  overflow: hidden;
}

.grid-folder-icon {
  font-size: 32px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.grid-file-icon {
  font-size: 32px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.grid-image-icon {
  font-size: 32px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.grid-image-container {
  width: 100%;
  height: 120px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.grid-image-container img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* 网格视图中的占位图 */
.grid-image-container .placeholder-image {
  max-width: 80%;
  max-height: 80%;
}

.grid-file-name {
  font-size: 14px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  margin-bottom: 4px;
  height: 28px;
}

.grid-file-info {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}

.folder-card {
  cursor: pointer;
}

.image-card {
  cursor: pointer;
}

.empty-container {
  padding: 40px 0;
  text-align: center;
}

/* 正在删除的卡片/行样式 */
.deleting-card {
  opacity: 0.6;
  position: relative;
}

.deleting-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.7);
  z-index: 10;
  border-radius: var(--radius-sm);
}

:deep(.deleting-row) {
  opacity: 0.6;
}
</style> 