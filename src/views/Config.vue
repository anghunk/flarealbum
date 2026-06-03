<template>
  <a-page-header
    title="S3 配置"
    sub-title="配置您的Cloudflare R2存储"
    :backIcon="false"
  />

  <div class="config-container">
    <a-card title="S3/R2存储配置" class="config-card">
      <a-form
        :model="formState"
        :rules="rules"
        layout="vertical"
        ref="formRef"
        @finish="onFinish"
        validate-trigger="blur"
      >
        <a-form-item name="accessKeyId" label="Access Key ID">
          <a-input
            v-model:value="formState.accessKeyId"
            placeholder="R2 Access Key ID"
            @blur="() => formRef?.validateFields(['accessKeyId'])"
          />
        </a-form-item>

        <a-form-item name="secretAccessKey" label="Secret Access Key">
          <a-input-password
            v-model:value="formState.secretAccessKey"
            placeholder="R2 Secret Access Key"
            @blur="() => formRef?.validateFields(['secretAccessKey'])"
          />
        </a-form-item>

        <a-form-item name="endpoint" label="终端节点URL">
          <a-input
            v-model:value="formState.endpoint"
            placeholder="例如: https://xxxxx.r2.cloudflarestorage.com"
            @blur="() => formRef?.validateFields(['endpoint'])"
          />
        </a-form-item>

        <a-form-item name="region" label="区域">
          <a-input
            v-model:value="formState.region"
            placeholder="R2通常为'auto'"
          />
        </a-form-item>

        <a-alert
          v-if="corsError"
          type="warning"
          show-icon
          message="CORS 配置错误"
          description="您需要在 Cloudflare R2 控制台中为此存储桶配置 CORS 设置，以允许从您的网站访问。请参阅下方的配置说明。"
          style="margin-bottom: 16px"
        />

        <a-form-item>
          <a-space>
            <a-button type="primary" html-type="submit" :loading="loading">
              保存配置
            </a-button>
            <a-button
              @click="testConnection"
              :disabled="!isFormComplete"
              :loading="testing"
            >
              测试连接
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-card>

    <!-- 存储桶管理 -->
    <a-card
      title="存储桶管理"
      class="config-card"
      v-if="configSaved"
    >
      <a-form layout="vertical">
        
        <!-- 存储桶列表 -->
        <a-form-item v-if="Object.keys(formState.bucketConfigs).length > 0" label="已配置的存储桶">
          <a-table
            :columns="bucketColumns"
            :data-source="bucketListData"
            :pagination="false"
            row-key="name"
            size="small"
            bordered
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'name'">
                <a-radio
                  :checked="record.name === formState.currentBucket"
                  @change="setCurrentBucket(record.name)"
                >
                  {{ record.name }}
                </a-radio>
              </template>

              <template v-if="column.dataIndex === 'customDomain'">
                <a-input
                  :value="formState.bucketConfigs[record.name]?.customDomain || ''"
                  @update:value="(val) => { formState.bucketConfigs[record.name].customDomain = val || '' }"
                  placeholder="例如: https://cdn.example.com"
                  size="small"
                />
              </template>

              <template v-if="column.dataIndex === 'test'">
                <a-button
                  size="small"
                  @click="testBucket(record.name)"
                  :loading="testingBuckets[record.name]"
                >
                  测试连接
                </a-button>
                <a-tag v-if="testResults[record.name]?.success" color="success" style="margin-left: 4px">
                  连通
                </a-tag>
                <a-tag v-if="testResults[record.name]?.success === false" color="error" style="margin-left: 4px">
                  失败
                </a-tag>
              </template>

              <template v-if="column.dataIndex === 'action'">
                <a-button
                  type="link"
                  size="small"
                  danger
                  :disabled="record.name === formState.currentBucket && Object.keys(formState.bucketConfigs).length === 1"
                  @click="removeBucket(record.name)"
                >
                  删除
                </a-button>
              </template>
            </template>
          </a-table>
        </a-form-item>

        <!-- 手动添加存储桶 -->
        <a-form-item label="手动添加存储桶">
          <a-input-search
            v-model:value="manualBucketName"
            placeholder="输入存储桶名称"
            enter-button="添加"
            @search="addBucketManual"
          />
        </a-form-item>
      </a-form>
    </a-card>

    <div class="config-help">
      <a-typography-title :level="4"
        >如何获取 Cloudflare R2 配置信息？</a-typography-title
      >
      <a-typography-paragraph>
        1. 登录 Cloudflare 仪表板
      </a-typography-paragraph>
      <a-typography-paragraph>
        2. 在左侧导航栏中选择"R2"
      </a-typography-paragraph>
      <a-typography-paragraph>
        3. 创建一个新的存储桶或选择现有存储桶
      </a-typography-paragraph>
      <a-typography-paragraph>
        4. 在"R2"页面中，点击"管理 R2 API 令牌"
      </a-typography-paragraph>
      <a-typography-paragraph>
        5. 创建一个新的 API 令牌，确保它具有读写权限
      </a-typography-paragraph>
      <a-typography-paragraph>
        6. 将获得的 Access Key ID 和 Secret Access Key 填入此表单
      </a-typography-paragraph>
      <a-typography-paragraph>
        7. 终端节点 URL 通常为：<code
          >https://&lt;ACCOUNT_ID&gt;.r2.cloudflarestorage.com</code
        >
      </a-typography-paragraph>
      <a-typography-paragraph>
        <a-alert type="info" show-icon>
          <template #message>
            Cloudflare R2 兼容 S3 API，因此可以使用相同的配置方式。
          </template>
        </a-alert>
      </a-typography-paragraph>

      <a-divider />

      <a-typography-title :level="4" id="cors-config"
        >配置 CORS（跨源资源共享）</a-typography-title
      >
      <a-typography-paragraph>
        要使用 FlareAlbum，您需要在 Cloudflare R2 控制台中配置 CORS 设置：
      </a-typography-paragraph>
      <a-typography-paragraph>
        1. 登录 Cloudflare 仪表板
      </a-typography-paragraph>
      <a-typography-paragraph>
        2. 在左侧导航栏中选择"R2"
      </a-typography-paragraph>
      <a-typography-paragraph> 3. 选择您的存储桶 </a-typography-paragraph>
      <a-typography-paragraph> 4. 点击"设置"标签 </a-typography-paragraph>
      <a-typography-paragraph>
        5. 找到"跨源资源共享 (CORS)"部分并点击"添加规则"
      </a-typography-paragraph>
      <a-typography-paragraph> 6. 配置规则如下： </a-typography-paragraph>
      <a-typography-paragraph>
        <pre
          style="
            background: var(--color-bg-secondary);
            padding: 10px;
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm);
            overflow-x: auto;
          "
        >
{
  "AllowedOrigins": ["*"],  // 或使用您的网站域名，如 ["https://example.com"]
  "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}</pre
        >
      </a-typography-paragraph>
      <a-typography-paragraph> 7. 点击"保存" </a-typography-paragraph>
      <a-typography-paragraph>
        <a-alert type="info" show-icon>
          <template #message>
            在生产环境中，建议将 AllowedOrigins
            设置为您的实际网站域名，而不是使用通配符 "*"。
          </template>
        </a-alert>
      </a-typography-paragraph>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { useStore } from "vuex";
import { message } from "ant-design-vue";
import s3Service from "../services/s3Service";
import cacheService from "../services/cacheService";

const store = useStore();
const formRef = ref();
const loading = ref(false);
const testing = ref(false);
const corsError = ref(false);
const configSaved = ref(false);

// 表单状态（不再包含 bucket 字段）
const formState = reactive({
  endpoint: "",
  region: "auto",
  accessKeyId: "",
  secretAccessKey: "",
  bucketConfigs: {},
  currentBucket: "",
});

// 存储桶管理状态
const manualBucketName = ref("");
const testingBuckets = reactive({}); // { bucketName: true/false }
const testResults = reactive({});    // { bucketName: { success, error } }

// 存储桶表格列定义
const bucketColumns = [
  { title: "存储桶名称", dataIndex: "name", key: "name" },
  { title: "自定义域名", dataIndex: "customDomain", key: "customDomain" },
  { title: "连接测试", dataIndex: "test", key: "test", width: 180 },
  { title: "操作", dataIndex: "action", key: "action", width: 80 },
];

// 存储桶列表数据
const bucketListData = computed(() => {
  return Object.keys(formState.bucketConfigs).map(name => ({
    name,
    customDomain: formState.bucketConfigs[name]?.customDomain || "",
    key: name,
  }));
});

// 表单验证规则（不再包含 bucket）
const rules = {
  endpoint: [
    {
      required: true,
      message: "请输入终端节点 URL",
      trigger: ["blur", "change"],
    },
    {
      type: "string",
      pattern: /^https?:\/\/.+/,
      message: "终端节点 URL 必须以 http://或 https://开头",
      trigger: ["blur", "change"],
    },
  ],
  accessKeyId: [
    {
      required: true,
      message: "请输入 Access Key ID",
      trigger: ["blur", "change"],
    },
  ],
  secretAccessKey: [
    {
      required: true,
      message: "请输入 Secret Access Key",
      trigger: ["blur", "change"],
    },
  ],
};

// 判断表单是否完整填写（不再需要 bucket）
const isFormComplete = computed(() => {
  return (
    formState.endpoint &&
    formState.accessKeyId &&
    formState.secretAccessKey
  );
});

// 存储桶管理方法

// 手动添加
const addBucketManual = (bucketName) => {
  bucketName = bucketName.trim();
  if (!bucketName) {
    message.warning("请输入存储桶名称");
    return;
  }
  if (formState.bucketConfigs[bucketName]) {
    message.warning("该存储桶已添加");
    return;
  }
  formState.bucketConfigs[bucketName] = { customDomain: "" };
  if (!formState.currentBucket) {
    formState.currentBucket = bucketName;
  }
  manualBucketName.value = "";
  message.success(`已添加存储桶：${bucketName}`);
};

// 删除桶
const removeBucket = (bucketName) => {
  if (bucketName === formState.currentBucket && Object.keys(formState.bucketConfigs).length === 1) {
    message.warning("至少需要保留一个存储桶");
    return;
  }
  if (bucketName === formState.currentBucket) {
    // 切换到另一个桶
    const remaining = Object.keys(formState.bucketConfigs).filter(b => b !== bucketName);
    formState.currentBucket = remaining[0] || "";
  }
  delete formState.bucketConfigs[bucketName];
  // 清除测试结果
  delete testResults[bucketName];
  delete testingBuckets[bucketName];
  message.success(`已移除存储桶：${bucketName}`);
};

// 设置当前桶
const setCurrentBucket = (bucketName) => {
  formState.currentBucket = bucketName;
};

// 更新桶的自定义域名
const updateBucketCustomDomain = (bucketName, customDomain) => {
  if (formState.bucketConfigs[bucketName]) {
    formState.bucketConfigs[bucketName].customDomain = customDomain?.trim().replace(/\/+$/, "") || ""
  }
}

// 测试单个桶的连通性
const testBucket = async (bucketName) => {
  testingBuckets[bucketName] = true;
  try {
    const result = await s3Service.testBucket(bucketName);
    testResults[bucketName] = result;
    if (result.success) {
      message.success(`存储桶 ${bucketName} 连接成功`);
    } else {
      message.error(`存储桶 ${bucketName} 连接失败: ${result.error}`);
    }
  } catch (error) {
    testResults[bucketName] = { success: false, error: error.message };
    message.error(`测试失败: ${error.message}`);
  } finally {
    testingBuckets[bucketName] = false;
  }
};

// 提交表单
const onFinish = async () => {
  loading.value = true;

  try {
    const config = {
      endpoint: formState.endpoint,
      region: formState.region,
      accessKeyId: formState.accessKeyId,
      secretAccessKey: formState.secretAccessKey,
      bucketConfigs: { ...formState.bucketConfigs },
      currentBucket: formState.currentBucket,
    };
    await store.dispatch("saveConfig", config);

    message.success("配置已保存");
    configSaved.value = true;
    corsError.value = false;
  } catch (error) {
    console.error("保存配置失败：", error);
    message.error(`保存失败：${error.message}`);
  } finally {
    loading.value = false;
  }
};

// 测试连接
const testConnection = async () => {
  testing.value = true;
  corsError.value = false;

  try {
    const tempService = new s3Service.constructor({
      endpoint: formState.endpoint,
      region: formState.region,
      accessKeyId: formState.accessKeyId,
      secretAccessKey: formState.secretAccessKey,
    });

    // 测试已配置的存储桶连通性
    if (formState.currentBucket) {
      const result = await tempService.testBucket(formState.currentBucket);
      if (result.success) {
        message.success(`连接成功！存储桶 ${formState.currentBucket} 可访问。`);
      } else {
        message.warning(`S3 连接正常，但存储桶 ${formState.currentBucket} 访问失败：${result.error}`);
      }
    } else {
      message.warning("请先添加一个存储桶再测试连接");
    }

    // 保存配置到 Vuex 和本地存储，确保 s3Service 已初始化
    const config = {
      endpoint: formState.endpoint,
      region: formState.region,
      accessKeyId: formState.accessKeyId,
      secretAccessKey: formState.secretAccessKey,
      bucketConfigs: { ...formState.bucketConfigs },
      currentBucket: formState.currentBucket,
    };
    await store.dispatch("saveConfig", config);
    configSaved.value = true;

    // 初始化缓存
    if (formState.currentBucket) {
      try {
        message.loading("正在初始化缓存数据...", 0);
        await cacheService.refreshBucketData(s3Service);
        message.destroy();
        message.success("缓存数据初始化完成！");
      } catch (cacheError) {
        message.destroy();
        console.error("初始化缓存失败：", cacheError);
        message.warning("连接成功，但初始化缓存数据失败，您可以稍后在图床管理页面手动刷新。");
      }
    }
  } catch (error) {
    console.error("连接测试失败：", error);

    // 检查是否是 CORS 错误
    if (
      error.message &&
      (error.message.includes("CORS") ||
        error.message.includes("Access-Control-Allow-Origin") ||
        error.message.includes("cross-origin"))
    ) {
      corsError.value = true;
      message.error("CORS 错误：您需要在 R2 控制台中配置跨域资源共享设置");
      setTimeout(() => {
        document
          .getElementById("cors-config")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 500);
    } else {
      message.error(`连接失败：${error.message}`);
    }
  } finally {
    testing.value = false;
  }
};

// 组件挂载时加载配置
onMounted(() => {
  // 检查 Vuex 中是否已有配置
  const storeConfig = store.state.s3Config;
  if (storeConfig) {
    // 加载新的配置格式
    formState.endpoint = storeConfig.endpoint || "";
    formState.region = storeConfig.region || "auto";
    formState.accessKeyId = storeConfig.accessKeyId || "";
    formState.secretAccessKey = storeConfig.secretAccessKey || "";
    formState.bucketConfigs = storeConfig.bucketConfigs || {};
    formState.currentBucket = storeConfig.currentBucket || Object.keys(formState.bucketConfigs)[0] || "";

    // 向后兼容：如果还没有 bucketConfigs 但有旧的 bucket/buckets
    if (Object.keys(formState.bucketConfigs).length === 0) {
      if (storeConfig.buckets && storeConfig.buckets.length > 0) {
        storeConfig.buckets.forEach(name => {
          formState.bucketConfigs[name] = { customDomain: "" };
        });
      } else if (storeConfig.bucket) {
        formState.bucketConfigs[storeConfig.bucket] = { customDomain: "" };
      }
      if (!formState.currentBucket) {
        formState.currentBucket = storeConfig.bucket || Object.keys(formState.bucketConfigs)[0] || "";
      }
    }

    configSaved.value = true;
    return;
  }

  // 如果 Vuex 中没有配置，尝试从本地存储加载
  const cachedConfig =
    s3Service.loadConfigFromStorage() || cacheService.loadUserConfig();
  if (cachedConfig) {
    formState.endpoint = cachedConfig.endpoint || "";
    formState.region = cachedConfig.region || "auto";
    formState.accessKeyId = cachedConfig.accessKeyId || "";
    formState.secretAccessKey = cachedConfig.secretAccessKey || "";
    formState.bucketConfigs = cachedConfig.bucketConfigs || {};

    // 向后兼容
    if (Object.keys(formState.bucketConfigs).length === 0) {
      if (cachedConfig.buckets && cachedConfig.buckets.length > 0) {
        cachedConfig.buckets.forEach(name => {
          formState.bucketConfigs[name] = { customDomain: "" };
        });
      } else if (cachedConfig.bucket) {
        formState.bucketConfigs[cachedConfig.bucket] = { customDomain: "" };
      }
    }

    formState.currentBucket = cachedConfig.currentBucket || cachedConfig.bucket || Object.keys(formState.bucketConfigs)[0] || "";

    // 迁移旧的全局 customDomainPrefix 到当前桶
    try {
      const settingsStr = localStorage.getItem('userSettings')
      if (settingsStr) {
        const settings = JSON.parse(settingsStr)
        if (settings?.customDomainPrefix && formState.currentBucket && formState.bucketConfigs[formState.currentBucket]) {
          if (!formState.bucketConfigs[formState.currentBucket].customDomain) {
            formState.bucketConfigs[formState.currentBucket].customDomain = settings.customDomainPrefix.trim().replace(/\/+$/, '')
          }
        }
      }
    } catch (e) {
      // 忽略迁移失败
    }

    store.dispatch("saveConfig", cachedConfig);
    configSaved.value = true;
  }
});
</script>

<style scoped>
.config-card {
  margin-bottom: 24px;
}

.config-help {
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>