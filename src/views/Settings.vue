<template>
  <div class="settings-container">
    <a-page-header title="我的设置" />

    <!-- 复制与链接设置 -->
    <a-card title="复制与链接" class="settings-card">
      <a-form layout="vertical">
        <a-form-item label="默认复制格式">
          <a-radio-group v-model:value="copyFormat">
            <a-radio value="url">URL 链接</a-radio>
            <a-radio value="markdown">Markdown 格式</a-radio>
            <a-radio value="html">HTML 格式</a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item label="自动复制上传后的链接">
          <a-switch v-model:checked="autoCopy" />
        </a-form-item>
      </a-form>
    </a-card>

    <!-- 上传路径设置 -->
    <a-card title="上传路径" class="settings-card">
      <a-form layout="vertical">
        <a-form-item label="上传路径模板">
          <a-select
            v-model:value="uploadPathTemplate"
            placeholder="选择或自定义上传路径模板"
            @change="handleTemplateChange"
            allowClear
          >
            <a-select-option value="{year}/{month}/{day}"
              >{year}/{month}/{day}（按年月日）</a-select-option
            >
            <a-select-option value="{year}/{month}"
              >{year}/{month}（按年月）</a-select-option
            >
            <a-select-option value="{year}/{month}/{day}/uploads"
              >{year}/{month}/{day}/uploads</a-select-option
            >
            <a-select-option value="{year}/{month}/{day}/{timestamp}"
              >{year}/{month}/{day}/{timestamp}</a-select-option
            >
            <a-select-option value="custom">自定义...</a-select-option>
          </a-select>
          <a-input
            v-if="uploadPathTemplate === 'custom'"
            v-model:value="customUploadPathTemplate"
            placeholder="例如: {year}/{month}/{day}/images/"
            style="margin-top: 8px"
          />
          <div class="setting-tip">
            当前模板示例：<a-tag color="blue">{{ getTemplateExample() }}</a-tag>
          </div>
        </a-form-item>

        <a-form-item label="上传路径前缀" v-if="uploadPathTemplate">
          <a-input
            v-model:value="uploadPathPrefix"
            placeholder="例如: images/（将添加在模板解析结果之前）"
            addonAfter="/"
          />
          <div class="setting-tip">
            最终路径示例：<a-tag color="green">{{ getFinalPathExample() }}</a-tag>
          </div>
        </a-form-item>
      </a-form>
    </a-card>

    <!-- 图片处理设置 -->
    <a-card title="图片处理" class="settings-card">
      <a-form layout="vertical">
        <a-form-item label="默认文件名处理">
          <a-radio-group v-model:value="defaultFileNameOption">
            <a-radio value="original">保留原始文件名</a-radio>
            <a-radio value="timestamp">使用时间戳替换</a-radio>
            <a-radio value="uuid">使用 UUID 替换</a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item label="图片自动转换为 WebP 格式">
          <a-switch v-model:checked="convertToWebp" />
          <div class="setting-tip">
            启用后，上传的图片将自动转换为 WebP 格式，可以大幅减小文件体积并提高加载速度。
            <a-tag v-if="convertToWebp" color="success">体积减小约 30-70%</a-tag>
          </div>
        </a-form-item>

        <a-form-item label="WebP 质量设置" v-if="convertToWebp">
          <a-slider
            v-model:value="webpQuality"
            :min="50"
            :max="100"
            :step="5"
            :marks="{
              50: '50%',
              75: '75%',
              100: '100%',
            }"
          />
          <div class="setting-tip">
            调整 WebP 转换的质量，数值越高质量越好，但文件越大。推荐 75%-85%
            的设置可以平衡质量和体积。
          </div>
        </a-form-item>
      </a-form>
    </a-card>

    <!-- 数据管理 -->
    <a-card title="数据管理" class="settings-card">
      <a-space direction="vertical" style="width: 100%">
        <a-alert
          type="info"
          show-icon
          message="清除配置会删除您存储的所有设置和上传历史"
        />

        <a-button danger @click="showClearDataConfirm"> 清除所有数据 </a-button>
      </a-space>
    </a-card>

    <!-- 关于 -->
    <a-card title="关于" class="settings-card">
      <a-typography>
        <a-typography-title :level="4">FlareAlbum</a-typography-title>
        <a-typography-paragraph>
          这是一个基于 Vue3 和 Ant Design Vue 构建的图床上传工具，专为 Cloudflare R2
          存储设计。通过直观的界面，您可以轻松上传、管理和分享图片。
        </a-typography-paragraph>
        <a-typography-paragraph>
          <ul>
            <li>支持拖拽上传图片</li>
            <li>支持管理 R2 存储中的文件</li>
            <li>支持文件夹管理</li>
            <li>支持预览和分享图片</li>
            <li>支持为每个存储桶单独设置自定义域名</li>
          </ul>
        </a-typography-paragraph>
        <a-typography-paragraph>
          <a-tag color="processing">Vue 3</a-tag>
          <a-tag color="success">Vite</a-tag>
          <a-tag color="warning">Cloudflare R2</a-tag>
          <a-tag color="error">S3 API</a-tag>
        </a-typography-paragraph>
      </a-typography>
    </a-card>

    <!-- 保存按钮 -->
    <div class="settings-actions">
      <a-button type="primary" size="large" @click="saveSettings">保存设置</a-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { message, Modal } from "ant-design-vue";
import { useStore } from "vuex";
import s3Service from "../services/s3Service";
import cacheService from "../services/cacheService";
import { resolvePathTemplate } from "../utils/pathTemplate";

const router = useRouter();
const store = useStore();

// 设置项（移除了 customDomainPrefix）
const copyFormat = ref("url");
const uploadPathTemplate = ref("");
const customUploadPathTemplate = ref("");
const uploadPathPrefix = ref("");
const defaultFileNameOption = ref("original");
const autoCopy = ref(true);
const convertToWebp = ref(false);
const webpQuality = ref(80);

// 处理模板选择变化
const handleTemplateChange = (value) => {
  if (value !== "custom") {
    customUploadPathTemplate.value = "";
  }
};

// 获取当前模板的示例
const getTemplateExample = () => {
  let template = uploadPathTemplate.value;
  if (template === "custom") {
    template = customUploadPathTemplate.value;
  }
  if (!template) return "根目录";
  return resolvePathTemplate(template) || "根目录";
};

// 获取最终路径示例
const getFinalPathExample = () => {
  let template = uploadPathTemplate.value;
  if (template === "custom") {
    template = customUploadPathTemplate.value;
  }
  const resolved = resolvePathTemplate(template || "");
  const prefix = uploadPathPrefix.value ? uploadPathPrefix.value + "/" : "";
  const basePath = prefix + resolved;
  return basePath ? basePath + "/" : "根目录" + "/";
};

// 保存设置（不再包含 customDomainPrefix）
const saveSettings = () => {
  const prefix = uploadPathPrefix.value.trim().replace(/^\/+|\/+$/g, "");

  const settings = {
    copyFormat: copyFormat.value,
    uploadPathTemplate: uploadPathTemplate.value,
    customUploadPathTemplate: customUploadPathTemplate.value,
    uploadPathPrefix: prefix,
    defaultFileNameOption: defaultFileNameOption.value,
    autoCopy: autoCopy.value,
    convertToWebp: convertToWebp.value,
    webpQuality: webpQuality.value,
  };

  // 使用 Vuex store action 保存设置
  store.dispatch("saveUserSettings", settings).then(() => {
    message.success("设置已保存并生效");
  });
};

// 显示清除数据确认
const showClearDataConfirm = () => {
  Modal.confirm({
    title: "确定要清除所有数据吗？",
    content: "这将删除您的所有配置和上传历史记录，此操作不可恢复。",
    okText: "确定清除",
    okType: "danger",
    cancelText: "取消",
    onOk() {
      clearAllData();
    },
  });
};

// 清除所有数据
const clearAllData = () => {
  store.commit("setS3Config", null);
  store.commit("setUserSettings", null);

  localStorage.removeItem("s3ConfigData");
  localStorage.removeItem("userSettings");
  localStorage.removeItem("recentUploads");

  cacheService.clearAllCache();

  message.success("所有数据已清除");

  setTimeout(() => {
    router.push("/upload");
    window.location.reload();
  }, 1000);
};

// 组件挂载时加载设置
onMounted(() => {
  const storeSettings = store.state.userSettings;

  const loadSettings = (settings) => {
    copyFormat.value = settings.copyFormat || "url";
    uploadPathTemplate.value = settings.uploadPathTemplate || "";
    customUploadPathTemplate.value = settings.customUploadPathTemplate || "";
    uploadPathPrefix.value = settings.uploadPathPrefix || "";
    defaultFileNameOption.value = settings.defaultFileNameOption || "original";
    autoCopy.value = settings.autoCopy !== undefined ? settings.autoCopy : true;
    convertToWebp.value =
      settings.convertToWebp !== undefined ? settings.convertToWebp : false;
    webpQuality.value = settings.webpQuality || 75;

    // 向后兼容：如果旧数据有 customDomainPrefix，迁移到桶配置中
    if (settings.customDomainPrefix) {
      const bucketConfigs = store.state.bucketConfigs || {};
      const currentBucket = store.state.currentBucket || Object.keys(bucketConfigs)[0];
      if (currentBucket && bucketConfigs[currentBucket]) {
        if (!bucketConfigs[currentBucket].customDomain) {
          store.dispatch("updateBucketCustomDomain", {
            bucketName: currentBucket,
            customDomain: settings.customDomainPrefix.trim().replace(/\/+$/, ""),
          });
        }
      }
    }
  };

  if (storeSettings) {
    loadSettings(storeSettings);
  } else {
    const cachedSettings = cacheService.loadUserSettings();
    if (cachedSettings) {
      loadSettings(cachedSettings);
      store.commit("setUserSettings", cachedSettings);
    } else {
      const storedSettings = localStorage.getItem("userSettings");
      if (storedSettings) {
        try {
          const settings = JSON.parse(storedSettings);
          loadSettings(settings);
          store.commit("setUserSettings", settings);
        } catch (e) {
          console.error("无法解析存储的设置：", e);
        }
      }
    }
  }
});
</script>

<style scoped>
.settings-card {
  margin-bottom: 24px;
}

.settings-actions {
  display: flex;
  justify-content: center;
  margin-top: 24px;
  padding-bottom: 24px;
}

.setting-tip {
  color: var(--color-text-secondary);
  font-size: 13px;
  margin-top: 8px;
  line-height: 1.6;
}

:deep(.ant-form-item) {
  margin-bottom: 20px;
}
</style>