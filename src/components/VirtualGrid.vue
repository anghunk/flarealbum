<template>
  <div
    class="virtual-grid"
    ref="scrollRef"
    @scroll="onScroll"
  >
    <!-- Phantom element to maintain total scroll height -->
    <div
      class="virtual-grid-phantom"
      :style="{ height: phantomHeight + 'px' }"
    ></div>

    <!-- Visible content rendered as CSS grid -->
    <div
      class="virtual-grid-content"
      :style="contentStyle"
    >
      <div
        v-for="vItem in visibleItems"
        :key="vItem.key"
        class="virtual-grid-item"
      >
        <slot name="item" :item="vItem.data" :index="vItem.index"></slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";

const props = defineProps({
  items: { type: Array, default: () => [] },
  estimatedRowHeight: { type: Number, default: 250 },
  gap: { type: Number, default: 16 },
  bufferRows: { type: Number, default: 3 },
  resetKey: { type: [String, Number], default: 0 },
});

const emit = defineEmits(["visibleChange"]);

const scrollRef = ref(null);
const scrollTop = ref(0);
const containerWidth = ref(800);
const containerHeight = ref(600);

// Responsive columns based on container width (matching Ant Design breakpoints)
const getColumnsFromWidth = (w) => {
  if (w >= 992) return 6;
  if (w >= 768) return 4;
  if (w >= 576) return 3;
  return 2;
};

const columns = computed(() => getColumnsFromWidth(containerWidth.value));

// Row calculations
const totalRows = computed(() =>
  Math.ceil(props.items.length / columns.value)
);
const rowStep = computed(() => props.estimatedRowHeight + props.gap);
const phantomHeight = computed(() => {
  if (totalRows.value === 0) return 0;
  return totalRows.value * rowStep.value - props.gap;
});

// Visible range calculation
const startRow = computed(() => {
  if (totalRows.value === 0) return 0;
  const raw = Math.floor(scrollTop.value / rowStep.value) - props.bufferRows;
  return Math.max(0, raw);
});

const endRow = computed(() => {
  if (totalRows.value === 0) return 0;
  const visibleCount = Math.ceil(containerHeight.value / rowStep.value);
  const raw = startRow.value + visibleCount + 2 * props.bufferRows;
  return Math.min(totalRows.value - 1, raw);
});

// Visible items (flattened from row range to item indices)
const visibleItems = computed(() => {
  if (props.items.length === 0) return [];
  const startIdx = startRow.value * columns.value;
  const endIdx = Math.min(props.items.length, (endRow.value + 1) * columns.value);
  const result = [];
  for (let i = startIdx; i < endIdx; i++) {
    const item = props.items[i];
    result.push({
      data: item,
      index: i,
      key: item?.key ?? i,
    });
  }
  return result;
});

// Y offset for positioning the visible content
const offsetY = computed(() => startRow.value * rowStep.value);

// CSS grid style for visible content
const contentStyle = computed(() => ({
  transform: `translateY(${offsetY.value}px)`,
  gridTemplateColumns: `repeat(${columns.value}, 1fr)`,
  gap: `${props.gap}px`,
}));

// Scroll handler
const onScroll = () => {
  if (scrollRef.value) {
    const newScrollTop = scrollRef.value.scrollTop;
    scrollTop.value = newScrollTop;
    // Emit visible range for lazy URL loading
    emit("visibleChange", {
      startIdx: startRow.value * columns.value,
      endIdx: Math.min(
        props.items.length,
        (endRow.value + 1) * columns.value
      ),
    });
  }
};

// Reset scroll position (called on navigation)
const resetScroll = () => {
  if (scrollRef.value) {
    scrollTop.value = 0;
    scrollRef.value.scrollTop = 0;
  }
};

defineExpose({ resetScroll });

// ResizeObserver for container dimensions
let resizeObserver = null;

onMounted(() => {
  if (scrollRef.value) {
    containerWidth.value = scrollRef.value.clientWidth;
    containerHeight.value = scrollRef.value.clientHeight;

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          containerWidth.value = entry.contentRect.width;
          containerHeight.value = entry.contentRect.height;
        }
      });
      resizeObserver.observe(scrollRef.value);
    }
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

// Watch resetKey to reset scroll on folder navigation
watch(
  () => props.resetKey,
  () => {
    resetScroll();
  }
);

// Emit initial visible range on mount
onMounted(() => {
  emit("visibleChange", {
    startIdx: 0,
    endIdx: Math.min(
      props.items.length,
      (2 * props.bufferRows + Math.ceil(containerHeight.value / rowStep.value)) * columns.value
    ),
  });
});
</script>

<style scoped>
.virtual-grid {
  height: calc(100vh - 220px);
  overflow-y: auto;
  position: relative;
  contain: layout style paint;
}

.virtual-grid-phantom {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: -1;
}

.virtual-grid-content {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  display: grid;
  will-change: transform;
}

.virtual-grid-item {
  display: contents;
}
</style>