<template>
  <div class="upload-container">
    <a-page-header title="图片上传" :backIcon="false">
    </a-page-header>

    <!-- 侧边树状结构 -->
    <a-drawer
      v-model:visible="showBucketTree"
      title="选择上传路径"
      placement="left"
      :width="320"
      :closable="true"
    >
      <div style="height: 100%; display: flex; flex-direction: column">
        <div v-if="bucketTree" class="tree-container">
          <a-tree
            :treeData="[bucketTree]"
            :fieldNames="{ title: 'name', key: 'path', children: 'children' }"
            @select="(keys) => selectUploadPath(keys[0])"
          >
            <template #title="{ name, files, children }">
              <span>
                {{ name || "根目录" }}
                <a-tag v-if="files?.length || children?.length">
                  {{ getChildCount({ files, children }) }}
                </a-tag>
              </span>
            </template>
          </a-tree>
        </div>
      </div>
    </a-drawer>

    <a-card>
      <!-- 警告提示 -->
      <a-alert
        v-if="!checkS3Config"
        type="warning"
        show-icon
        message="请先完成S3配置"
        description="您需要先在S3配置页面中完成Cloudflare R2存储设置后才能上传文件。"
        style="margin-bottom: 16px"
      />

      <!-- 存储桶选择器 -->
      <a-form-item
        v-if="buckets.length > 1"
        label="当前存储桶"
        style="margin-bottom: 16px"
      >
        <a-select
          :value="currentBucket"
          @change="handleBucketChange"
          style="width: 200px"
        >
          <a-select-option
            v-for="bucket in buckets"
            :key="bucket"
            :value="bucket"
          >
            {{ bucket }}
          </a-select-option>
        </a-select>
      </a-form-item>

      <!-- 上传表单 -->
      <div class="upload-form">

        <!-- 文件上传区域 -->
        <a-upload-dragger
          :multiple="true"
          :before-upload="beforeUpload"
          :file-list="selectedFiles"
          @change="handleFileChange"
          :show-upload-list="false"
          :customRequest="() => {}"
        >
          <p class="ant-upload-drag-icon">
            <inbox-outlined />
          </p>
          <p class="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p class="ant-upload-hint">
            支持单个或批量上传图片，每个文件不超过 5MB
            <span v-if="isWebpEnabled">（将自动转换为 WebP 格式）</span>
          </p>
        </a-upload-dragger>

        <!-- 图片预览网格 -->
        <div v-if="selectedFiles.length > 0" class="preview-grid">
          <a-row :gutter="[12, 12]">
            <a-col
              v-for="file in selectedFiles"
              :key="file.uid"
              :xs="6" :sm="4" :md="3" :lg="2"
            >
              <div class="preview-item">
                <div class="preview-thumbnail">
                  <img
                    v-if="previewUrls.get(file.uid)"
                    :src="previewUrls.get(file.uid)"
                    :alt="file.name"
                  />
                  <file-image-outlined v-else class="preview-placeholder" />
                </div>
                <div class="preview-info">
                  <span class="preview-filename">{{ file.name }}</span>
                  <span class="preview-size">{{ formatFileSize(file.size) }}</span>
                </div>
                <a-button
                  class="preview-remove"
                  type="text"
                  size="small"
                  danger
                  @click="removeFile(file)"
                  :disabled="uploading"
                >
                  <template #icon><close-outlined /></template>
                </a-button>
              </div>
            </a-col>
          </a-row>
        </div>

        <!-- 上传按钮 -->
        <div class="upload-actions">
          <a-space>
            <a-button
              type="primary"
              :disabled="selectedFiles.length === 0 || uploading || !checkS3Config"
              @click="uploadFiles"
              :loading="uploading"
            >
              <upload-outlined /> {{ uploading ? "上传中..." : "开始上传" }}
            </a-button>
            <a-button
              @click="clearFiles"
              :disabled="selectedFiles.length === 0 || uploading"
            >
              清空列表
            </a-button>
          </a-space>
        </div>
      </div>

      <!-- 上传进度 -->
      <div v-if="uploadProgress.total > 0" class="upload-progress">
        <div class="progress-header">
          <span
            >上传进度：{{ uploadProgress.success + uploadProgress.fail }}/{{
              uploadProgress.total
            }}</span
          >
          <span>
            <a-tag color="success">成功：{{ uploadProgress.success }}</a-tag>
            <a-tag color="error" v-if="uploadProgress.fail > 0"
              >失败：{{ uploadProgress.fail }}</a-tag
            >
          </span>
        </div>
        <a-progress
          :percent="
            Math.round(
              ((uploadProgress.success + uploadProgress.fail) / uploadProgress.total) *
                100
            )
          "
          :success="{
            percent: Math.round((uploadProgress.success / uploadProgress.total) * 100),
          }"
          :status="
            uploadProgress.fail > 0
              ? 'exception'
              : uploadProgress.total === uploadProgress.success + uploadProgress.fail
              ? 'success'
              : 'active'
          "
        />
      </div>

      <!-- 上传结果列表 -->
      <div v-if="uploadResults.length > 0" class="upload-results">
        <a-divider>上传结果</a-divider>
        <a-list :data-source="uploadResults" :pagination="{ pageSize: 5 }">
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #avatar>
                  <div class="result-icon">
                    <check-circle-outlined v-if="item.success" class="success-icon" />
                    <close-circle-outlined v-else class="error-icon" />
                  </div>
                </template>
                <template #title>
                  <div class="result-title">
                    {{ item.filename }}
                    <a-tag v-if="item.success" color="success">上传成功</a-tag>
                    <a-tag v-if="item.success && item.isWebp" color="processing"
                      >WebP</a-tag
                    >
                    <a-tag v-else-if="!item.success" color="error">上传失败</a-tag>
                  </div>
                </template>
                <template #description>
                  <div v-if="item.success">
                    <div class="result-url">{{ item.url }}</div>
                    <div class="result-actions">
                      <a-space>
                        <a-button
                          type="link"
                          size="small"
                          @click="copyUrl(item.url, 'url')"
                        >
                          复制链接
                        </a-button>
                        <a-button
                          type="link"
                          size="small"
                          @click="copyUrl(item.url, 'markdown')"
                        >
                          复制 Markdown
                        </a-button>
                        <a-button
                          type="link"
                          size="small"
                          @click="copyUrl(item.url, 'html')"
                        >
                          复制 HTML
                        </a-button>
                      </a-space>
                    </div>
                  </div>
                  <div v-else class="error-message">错误：{{ item.error }}</div>
                </template>
              </a-list-item-meta>
            </a-list-item>
          </template>
        </a-list>
      </div>
    </a-card>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, watch } from "vue";
import { useStore } from "vuex";
import { useRouter } from "vue-router";
import { message } from "ant-design-vue";
import {
  InboxOutlined,
  UploadOutlined,
  FolderOutlined,
  PartitionOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  FileImageOutlined,
} from "@ant-design/icons-vue";
import s3Service from "../services/s3Service";
import cacheService from "../services/cacheService";
import imageCompression from "browser-image-compression";
import { resolvePathTemplate } from "../utils/pathTemplate";

const store = useStore();
const router = useRouter();

// 状态
const uploading = ref(false);
const selectedFiles = ref([]);
const uploadPath = ref("");
const showBucketTree = ref(false);
const bucketTree = ref(null);
const filenameOption = ref("timestamp"); // 默认使用时间戳命名
const customFilename = ref("");
const uploadResults = ref([]);
const uploadProgress = ref({
  total: 0,
  success: 0,
  fail: 0,
});

// 图片预览 URL 映射
const previewUrls = reactive(new Map());

// 存储桶管理
const currentBucket = computed(() => store.state.currentBucket || "");
const buckets = computed(() => Object.keys(store.state.bucketConfigs || {}));

// 生成预览 URL
const generatePreviewUrl = (file) => {
  if (file.originFileObj && file.type?.startsWith("image/")) {
    const url = URL.createObjectURL(file.originFileObj);
    previewUrls.set(file.uid, url);
  }
};

// 撤销预览 URL
const revokePreviewUrl = (uid) => {
  const url = previewUrls.get(uid);
  if (url) {
    URL.revokeObjectURL(url);
    previewUrls.delete(uid);
  }
};

// 格式化文件大小
const formatFileSize = (size) => {
  if (!size) return "";
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / (1024 * 1024)).toFixed(2) + " MB";
};

// 检查 S3 配置
const checkS3Config = computed(() => {
  return !!store.state.s3Config;
});

// 获取用户设置
const userSettings = computed(() => {
  return store.state.userSettings || {};
});

// 是否启用 WebP 转换
const isWebpEnabled = computed(() => {
  return userSettings.value.convertToWebp === true;
});

// WebP 质量设置
const webpQuality = computed(() => {
  return userSettings.value.webpQuality || 75;
});

// 显示当前上传路径
const displayUploadPath = computed(() => {
  if (uploadPath.value) return uploadPath.value;

  const template = userSettings.value.uploadPathTemplate;
  const customTemplate = userSettings.value.customUploadPathTemplate;
  const prefix = userSettings.value.uploadPathPrefix;

  if (!template) return "根目录";

  let resolvedPath =
    template === "custom"
      ? resolvePathTemplate(customTemplate || "")
      : resolvePathTemplate(template);

  if (prefix) {
    resolvedPath = prefix + "/" + resolvedPath;
  }

  return resolvedPath || "根目录";
});

// 获取树中文件夹的子项数量
const getChildCount = (node) => {
  let count = 0;
  if (node.files) count += node.files.length;
  if (node.children) count += node.children.length;
  return count;
};

// 选择上传路径
const selectUploadPath = (path) => {
  if (path) {
    // 标准化路径格式，移除结尾的斜杠
    uploadPath.value = path.replace(/^\/+|\/+$/g, "");
    showBucketTree.value = false;
  }
};

// 切换显示树结构
const toggleBucketTree = () => {
  showBucketTree.value = !showBucketTree.value;

  // 如果树结构为空，尝试加载
  if (!bucketTree.value) {
    bucketTree.value = cacheService.getBucketTree();

    // 如果缓存中没有树结构，尝试加载一次
    if (!bucketTree.value && checkS3Config.value) {
      loadBucketTree();
    }
  }
};

// 加载存储桶树结构
const loadBucketTree = async () => {
  try {
    // 先尝试从缓存获取
    bucketTree.value = cacheService.getBucketTree();

    // 如果缓存中没有树结构或树结构为空，尝试刷新一次
    if (
      !bucketTree.value ||
      (!bucketTree.value.children?.length && !bucketTree.value.files?.length)
    ) {
      // 刷新整个存储桶数据
      await cacheService.refreshBucketData(s3Service);
      bucketTree.value = cacheService.getBucketTree();
    }
  } catch (error) {
    console.error("加载存储桶树结构失败：", error);
  }
};

// 文件上传前检查
const beforeUpload = (file) => {
  // 检查文件类型
  const isImage = file.type.startsWith("image/");
  if (!isImage) {
    message.error("只能上传图片文件！");
    return false;
  }

  // 检查文件大小，限制为 5MB
  const isLt5M = file.size / 1024 / 1024 < 5;
  if (!isLt5M) {
    message.error("图片必须小于5MB！");
    return false;
  }

  return false; // 阻止自动上传
};

// 处理文件变更
const handleFileChange = (info) => {
  // 只添加新文件，避免重复
  const newFiles = info.fileList.filter(
    (file) => !selectedFiles.value.some((f) => f.uid === file.uid)
  );

  // 过滤掉不符合要求的文件
  const validFiles = newFiles.filter((file) => {
    const isImage = file.type.startsWith("image/");
    const isLt5M = file.size / 1024 / 1024 < 5;
    return isImage && isLt5M;
  });

  // 为每个有效文件生成预览 URL
  validFiles.forEach((file) => {
    generatePreviewUrl(file);
  });

  // 合并文件列表
  selectedFiles.value = [...selectedFiles.value, ...validFiles];
};

// 移除文件
const removeFile = (file) => {
  revokePreviewUrl(file.uid);
  selectedFiles.value = selectedFiles.value.filter((f) => f.uid !== file.uid);
};

// 清空文件列表
const clearFiles = () => {
  // 撤销所有预览 URL
  previewUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });
  previewUrls.clear();
  selectedFiles.value = [];
};

// 转换图片为 WebP 格式
const convertToWebP = async (file) => {
  if (!isWebpEnabled.value || !file.type.startsWith("image/")) {
    return file;
  }

  try {
    // 跳过已经是 WebP 格式的图片
    if (file.type === "image/webp") {
      return file;
    }

    // 压缩选项
    const options = {
      maxSizeMB: 5,
      maxWidthOrHeight: 4096,
      useWebWorker: true,
      fileType: "image/webp",
      quality: webpQuality.value / 100,
    };

    // 执行压缩
    const compressedFile = await imageCompression(file, options);

    // 创建一个新的文件对象以便于维护原始文件名但改变扩展名
    const originalName = file.name.split(".").slice(0, -1).join(".");
    const newFileName = `${originalName}.webp`;
    return new File([compressedFile], newFileName, { type: "image/webp" });
  } catch (error) {
    console.error("WebP 转换失败：", error);
    message.warning(`文件 ${file.name} 无法转换为 WebP 格式，将使用原始格式上传`);
    return file;
  }
};

// 生成文件名
const generateFilename = (file) => {
  if (!file) return "";

  const timestamp = Date.now();
  const extension =
    isWebpEnabled.value && file.type !== "image/webp"
      ? "webp"
      : file.name.split(".").pop().toLowerCase();

  switch (filenameOption.value) {
    case "original":
      // 如果转换为 WebP 但保留原文件名，需要替换扩展名
      if (isWebpEnabled.value && file.type !== "image/webp") {
        const basename = file.name.split(".").slice(0, -1).join(".");
        return `${basename}.webp`;
      }
      return file.name;
    case "timestamp":
      return `${timestamp}.${extension}`;
    case "custom":
      const prefix = customFilename.value || "image";
      return `${prefix}_${timestamp}.${extension}`;
    default:
      return file.name;
  }
};

// 构建上传路径
const buildUploadPath = (filename) => {
  // 从用户设置中获取模板配置
  const template = userSettings.value.uploadPathTemplate;
  const customTemplate = userSettings.value.customUploadPathTemplate;
  const prefix = userSettings.value.uploadPathPrefix;

  let resolvedPath = "";
  if (template) {
    if (template === "custom" && customTemplate) {
      resolvedPath = resolvePathTemplate(customTemplate);
    } else {
      resolvedPath = resolvePathTemplate(template);
    }
  }

  // 如果手动选择了上传路径，使用手动输入的路径
  const manualPath = uploadPath.value.trim();

  // 组合路径
  const parts = [];
  if (prefix) parts.push(prefix);
  if (manualPath) parts.push(manualPath);
  else if (resolvedPath) parts.push(resolvedPath);

  // 处理路径格式，避免出现双斜杠
  let path = parts
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (path) {
    path = path + "/";
  }

  // 确保文件名不包含路径分隔符
  const cleanFilename = filename.replace(/^\/+/, "");

  return path + cleanFilename;
};

// 上传文件
const uploadFiles = async () => {
  if (selectedFiles.value.length === 0) {
    message.warning("请先选择要上传的文件！");
    return;
  }

  if (!checkS3Config.value) {
    message.error("请先完成 S3 配置！");
    return;
  }

  // 重置上传进度
  uploadProgress.value = {
    total: selectedFiles.value.length,
    success: 0,
    fail: 0,
  };

  uploading.value = true;

  // 清空之前的上传结果
  uploadResults.value = [];

  // 并行上传所有文件
  await Promise.all(
    selectedFiles.value.map(async (file) => {
      try {
        // 准备文件，可能需要转换为 WebP
        const processedFile = await convertToWebP(file.originFileObj);

        // 生成文件名
        const filename = generateFilename(processedFile);

        // 构建完整路径
        const fullPath = buildUploadPath(filename);

        // 上传文件
        const result = await s3Service.uploadFile(processedFile, fullPath);

        // 更新进度
        uploadProgress.value.success++;

        // 添加到上传结果
        uploadResults.value.push({
          filename: filename,
          path: fullPath,
          url: result.url,
          success: true,
          isWebp: processedFile.type === "image/webp",
        });

        // 更新缓存
        await updateCache(fullPath);
      } catch (error) {
        console.error("上传文件失败：", error);

        // 更新进度
        uploadProgress.value.fail++;

        // 添加到上传结果
        uploadResults.value.push({
          filename: file.name,
          success: false,
          error: error.message || "上传失败",
        });
      }
    })
  );

  // 上传完成
  uploading.value = false;

  // 显示结果消息
  if (uploadProgress.value.fail === 0) {
    message.success(`成功上传 ${uploadProgress.value.success} 个文件！`);
  } else {
    message.warning(
      `上传完成，${uploadProgress.value.success} 个成功，${uploadProgress.value.fail} 个失败。`
    );
  }
};

// 更新缓存
const updateCache = async (filePath) => {
  try {
    // 获取文件所在目录
    const dirPath = filePath.split("/").slice(0, -1).join("/");

    // 强制刷新该目录的缓存
    const files = await s3Service.listObjects(dirPath);

    // 保存到缓存
    cacheService.saveFileList(dirPath, files);

    // 更新树结构
    bucketTree.value = cacheService.getBucketTree();
  } catch (error) {
    console.error("更新缓存失败：", error);
  }
};

// 复制 URL
const copyUrl = (url, format) => {
  if (!url) return;

  const filename = url.split("/").pop();
  let copyText = url;

  // 根据格式转换 URL
  if (format === "markdown") {
    copyText = `![${filename}](${url})`;
  } else if (format === "html") {
    copyText = `<img src="${url}" alt="${filename}" />`;
  }

  navigator.clipboard
    .writeText(copyText)
    .then(() => {
      message.success("已复制到剪贴板");
    })
    .catch(() => {
      message.error("复制失败，请手动复制");
    });
};

// 存储桶切换
const handleBucketChange = async (bucketName) => {
  if (bucketName === currentBucket.value) return;

  try {
    await store.dispatch("switchBucket", bucketName);

    // 清空预览和文件状态
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.clear();
    selectedFiles.value = [];
    uploadResults.value = [];
    uploadProgress.value = { total: 0, success: 0, fail: 0 };

    // 重载存储桶树结构
    bucketTree.value = null;
    await loadBucketTree();

    message.success(`已切换到存储桶：${bucketName}`);
  } catch (error) {
    console.error("切换存储桶失败：", error);
    message.error(`切换存储桶失败：${error.message}`);
  }
};

// 组件卸载时清理预览 URL
onUnmounted(() => {
  previewUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });
  previewUrls.clear();
});

// 跳转到管理页面
const navigateToManage = () => {
  router.push("/manage");
};

// 挂载时加载数据
onMounted(() => {
  // 加载树结构
  loadBucketTree();

  // 检查是否有 S3 配置
  if (!checkS3Config.value) {
    // 尝试从缓存加载配置
    const cachedConfig =
      s3Service.loadConfigFromStorage() || cacheService.loadUserConfig();
    if (cachedConfig) {
      // 更新到 Vuex
      store.dispatch("saveConfig", cachedConfig);
    }
  }
});

// 监听 S3 配置变化
watch(
  () => store.state.s3Config,
  (newConfig) => {
    if (newConfig && !bucketTree.value) {
      loadBucketTree();
    }
  }
);

// 监听上传路径变化，保存到本地存储（仅手动选择的路径）
watch(uploadPath, (newPath) => {
  if (newPath) {
    localStorage.setItem("r2_image_hosting_upload_path", newPath);
  }
});
</script>

<style scoped>
.upload-container {
  max-width: 1200px;
  margin: 0 auto;
}

.upload-form {
  margin-bottom: 20px;
}

.path-tip {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.current-path {
  color: var(--color-accent);
  font-weight: 500;
}

.tree-container {
  overflow: auto;
  flex: 1;
}

.upload-actions {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.upload-progress {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.upload-results {
  margin-top: 16px;
}

.result-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.success-icon {
  font-size: 24px;
  color: #52c41a;
}

.error-icon {
  font-size: 24px;
  color: #f5222d;
}

.result-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-url {
  color: var(--color-text-secondary);
  word-break: break-all;
}

.result-actions {
  margin-top: 4px;
}

.error-message {
  color: #f5222d;
}

.filename-preview {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.webp-tag {
  margin-left: 8px;
  color: var(--color-accent);
  background-color: var(--color-accent-subtle);
  border-color: var(--color-border);
  padding: 0 7px;
  font-size: 12px;
  border-radius: var(--radius-sm);
}

.preview-grid {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.preview-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.preview-thumbnail {
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-bg-secondary);
}

.preview-thumbnail img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-placeholder {
  font-size: 24px;
  color: var(--color-text-muted);
}

.preview-info {
  margin-top: 4px;
  text-align: center;
  overflow: hidden;
  max-width: 100%;
}

.preview-filename {
  display: block;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.preview-size {
  display: block;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.preview-remove {
  position: absolute;
  top: 0;
  right: 0;
}
</style>
