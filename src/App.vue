<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { 
  SettingOutlined, 
  CloudUploadOutlined, 
  PictureOutlined,
  ToolOutlined
} from '@ant-design/icons-vue'

const router = useRouter()
const route = useRoute()
const selectedKeys = ref([route.path.substring(1) || 'upload'])
const contentRef = ref(null)
const collapsed = ref(false)

// 路由导航函数
const navigateTo = (path) => {
  router.push(path)
}

// 监听路由变化以更新选中的菜单项
watch(() => route.path, (newPath) => {
  selectedKeys.value = [newPath.substring(1) || 'upload']
  
  // 确保内容区域滚动到顶部
  if (contentRef.value) {
    setTimeout(() => {
      const contentElement = contentRef.value
      if (contentElement) {
        contentElement.scrollTop = 0
      }
    }, 0)
  }
})

// 处理侧边栏收缩状态变化
const onCollapse = (value) => {
  collapsed.value = value
}

// 初始化时设置当前路径对应的菜单项
onMounted(() => {
  selectedKeys.value = [route.path.substring(1) || 'upload']
})
</script>

<template>
  <a-layout style="min-height: 100vh; background: #f0f2f5;">
    <!-- 侧边菜单 -->
    <a-layout-sider
      breakpoint="lg"
      collapsible
      width="220"
      style="overflow: auto; height: 100vh; position: fixed; left: 0; box-shadow: 2px 0 8px rgba(0,0,0,0.06);"
      v-model:collapsed="collapsed"
      @collapse="onCollapse"
      theme="light"
    >
      <div class="logo" :class="{ 'logo-collapsed': collapsed }">
        <span v-if="!collapsed">FlareAlbum</span>
        <span v-else>FA</span>
      </div>
      <a-menu
        v-model:selectedKeys="selectedKeys"
        mode="inline"
        theme="light"
      >
        <a-menu-item key="config" @click="navigateTo('/config')">
          <template #icon><setting-outlined /></template>
          <span>S3 配置</span>
        </a-menu-item>
        <a-menu-item key="upload" @click="navigateTo('/upload')">
          <template #icon><cloud-upload-outlined /></template>
          <span>上传图片</span>
        </a-menu-item>
        <a-menu-item key="manage" @click="navigateTo('/manage')">
          <template #icon><picture-outlined /></template>
          <span>图床管理</span>
        </a-menu-item>
        <a-menu-item key="settings" @click="navigateTo('/settings')">
          <template #icon><tool-outlined /></template>
          <span>我的设置</span>
        </a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout :style="{ marginLeft: collapsed ? '80px' : '220px', transition: 'all 0.2s' }">
      <!-- 主要内容区域 -->
      <a-layout-content
        ref="contentRef"
        style="margin: 16px; overflow: auto;"
      >
        <div style="padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
          <router-view />
        </div>
      </a-layout-content>

      <a-layout-footer style="text-align: center; color: #999; background: transparent;">
        FlareAlbum ©2025 By <a href="https://github.com/ezyshu/flarealbum" target="_blank">ezyshu</a>
      </a-layout-footer>
    </a-layout>
  </a-layout>
</template>

<style>
.logo {
  height: 48px;
  margin: 16px;
  color: #1a1a2e;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  border-radius: 8px;
}

.logo-collapsed {
  font-size: 14px;
}
</style>
