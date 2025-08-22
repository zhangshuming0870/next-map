# 标签显示层级控制功能

## 功能概述

本次更新为地铁系统添加了灵活的标签显示层级控制功能，用户可以自定义站点标签和列车标签的显示条件。

## 主要特性

### 1. 智能层级控制
- **站点标签**：默认在缩放级别 ≥ 10 时显示
- **列车标签**：默认在缩放级别 ≥ 11 时显示
- 支持动态调整显示层级

### 2. 实时控制面板
- 左下角新增标签显示控制面板
- 可以单独开启/关闭站点标签和列车标签
- 显示当前配置的显示层级

### 3. 快速设置选项
- **显示更多**：降低显示层级，让标签在更小的缩放级别就显示
- **显示更少**：提高显示层级，减少标签显示

## 技术实现

### 配置结构
```typescript
private labelDisplayConfig = {
    stationLabels: {
        minZoom: 10,  // 站点标签显示的最小缩放级别
        enabled: true
    },
    vehicleLabels: {
        minZoom: 11,  // 列车标签显示的最小缩放级别
        enabled: true
    }
};
```

### 核心方法

#### 配置标签显示
```typescript
public configureLabelDisplay(config: {
    stationLabels?: {
        minZoom?: number;
        enabled?: boolean;
    };
    vehicleLabels?: {
        minZoom?: number;
        enabled?: boolean;
    };
}): void
```

#### 获取当前配置
```typescript
public getLabelDisplayConfig(): any
```

### 显示逻辑
```typescript
// 站点标签显示条件
const showStationText = typeof zoom === 'number' ? 
    (zoom >= this.labelDisplayConfig.stationLabels.minZoom && this.labelDisplayConfig.stationLabels.enabled) : 
    this.labelDisplayConfig.stationLabels.enabled;

// 列车标签显示条件
const showVehicleLabels = typeof zoom === 'number' ? 
    (zoom >= this.labelDisplayConfig.vehicleLabels.minZoom && this.labelDisplayConfig.vehicleLabels.enabled) : 
    this.labelDisplayConfig.vehicleLabels.enabled;
```

## 使用方法

### 1. 控制面板操作

#### 开启/关闭标签
- 点击对应的开关按钮可以开启或关闭标签显示
- 绿色表示开启，红色表示关闭

#### 查看当前层级
- 面板显示当前配置的显示层级
- 例如："显示层级: ≥ 10" 表示在缩放级别10及以上时显示

#### 快速设置
- **显示更多**：站点标签 ≥ 8，列车标签 ≥ 9
- **显示更少**：站点标签 ≥ 12，列车标签 ≥ 13

### 2. 编程接口

#### 设置站点标签层级
```typescript
metro.configureLabelDisplay({
    stationLabels: { minZoom: 8, enabled: true }
});
```

#### 设置列车标签层级
```typescript
metro.configureLabelDisplay({
    vehicleLabels: { minZoom: 9, enabled: false }
});
```

#### 同时设置多个选项
```typescript
metro.configureLabelDisplay({
    stationLabels: { minZoom: 8, enabled: true },
    vehicleLabels: { minZoom: 9, enabled: true }
});
```

## 默认配置

### 初始设置
- **站点标签**：缩放级别 ≥ 10，默认开启
- **列车标签**：缩放级别 ≥ 11，默认开启

### 推荐配置

#### 详细视图（显示更多标签）
```typescript
stationLabels: { minZoom: 8, enabled: true }
vehicleLabels: { minZoom: 9, enabled: true }
```

#### 简洁视图（显示更少标签）
```typescript
stationLabels: { minZoom: 12, enabled: true }
vehicleLabels: { minZoom: 13, enabled: true }
```

#### 仅显示站点
```typescript
stationLabels: { minZoom: 10, enabled: true }
vehicleLabels: { minZoom: 11, enabled: false }
```

## 界面布局

### 控制面板位置
- **位置**：左下角
- **样式**：半透明黑色背景
- **大小**：最大宽度300px

### 面板内容
1. **标题**：🏷️ 标签显示控制
2. **站点标签控制**：📍 站点标签 + 开关按钮
3. **列车标签控制**：🚇 列车标签 + 开关按钮
4. **快速设置**：显示更多/显示更少按钮

## 性能优化

### 渲染优化
- 标签显示状态变化时自动重新渲染
- 避免不必要的图层重建
- 使用条件渲染减少DOM元素

### 内存管理
- 配置对象使用深拷贝避免引用问题
- 及时清理不需要的图层
- 优化事件监听器

## 注意事项

1. **缩放级别范围**：建议设置在 8-15 之间
2. **性能考虑**：过多的标签可能影响渲染性能
3. **用户体验**：根据实际使用场景调整显示层级
4. **配置持久化**：当前配置不会保存，刷新页面后恢复默认

## 未来扩展

可以考虑添加的功能：
- 配置持久化存储
- 更多标签类型（如线路名称标签）
- 标签样式自定义
- 动画过渡效果
- 批量配置功能
