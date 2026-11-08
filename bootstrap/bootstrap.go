package bootstrap

import (
	"fmt"
	"guanlan/logger"
	"sort"
	"sync"
	"time"
)

// Priority 初始化优先级常量
const (
	PriorityInfrastructure = 10  // 基础设施（日志、配置等）
	PriorityDatabase       = 20  // 数据库连接
	PriorityCore           = 50  // 核心模块（Proxy、Market等）
	PriorityBusiness       = 100 // 业务模块（Trader、API等）
	PriorityBackground     = 200 // 后台任务
)

// ErrorPolicy 错误处理策略
type ErrorPolicy int

const (
	// FailFast 遇到错误立即停止（默认）
	FailFast ErrorPolicy = iota
	// ContinueOnError 继续执行，收集所有错误
	ContinueOnError
	// WarnOnError 继续执行，只打印警告
	WarnOnError
)

var (
	hooks   []Hook
	hooksMu sync.Mutex
)

// Register 注册初始化钩子
// name: 模块名称（如 "Proxy", "Database"）
// priority: 优先级（建议使用常量：PriorityCore、PriorityBusiness等）
// fn: 初始化函数
func Register(name string, priority int, fn func(*Context) error) *HookBuilder {
	hooksMu.Lock()
	defer hooksMu.Unlock()

	hook := Hook{
		Name:        name,
		Priority:    priority,
		Func:        fn,
		Enabled:     nil, // 默认启用
		ErrorPolicy: FailFast,
	}

	hooks = append(hooks, hook)

	return &HookBuilder{hook: &hooks[len(hooks)-1]}
}

// Run 执行所有已注册的钩子
func Run(ctx *Context) error {
	return RunWithPolicy(ctx, FailFast)
}

// RunWithPolicy 使用指定的默认错误策略执行所有钩子
func RunWithPolicy(ctx *Context, defaultPolicy ErrorPolicy) error {
	hooksMu.Lock()
	hooksCopy := make([]Hook, len(hooks))
	copy(hooksCopy, hooks)
	hooksMu.Unlock()

	if len(hooksCopy) == 0 {
		logger.Log.Warnf("⚠️  没有注册任何初始化钩子")
		return nil
	}

	// 按优先级排序
	sort.Slice(hooksCopy, func(i, j int) bool {
		return hooksCopy[i].Priority < hooksCopy[j].Priority
	})

	logger.Log.Infof("🔄 开始初始化 %d 个模块...", len(hooksCopy))
	startTime := time.Now()

	var errors []error
	successCount := 0
	skippedCount := 0

	for i, hook := range hooksCopy {
		// 检查是否启用
		if hook.Enabled != nil && !hook.Enabled(ctx) {
			logger.Log.Infof("  [%d/%d] 跳过: %s (条件未满足)",
				i+1, len(hooksCopy), hook.Name)
			skippedCount++
			continue
		}

		logger.Log.Infof("  [%d/%d] 初始化: %s (优先级: %d)",
			i+1, len(hooksCopy), hook.Name, hook.Priority)

		hookStart := time.Now()
		err := hook.Func(ctx)
		elapsed := time.Since(hookStart)

		if err != nil {
			errMsg := fmt.Errorf("[%s] 初始化失败: %w", hook.Name, err)

			// 根据错误策略处理
			policy := hook.ErrorPolicy
			if policy == FailFast && defaultPolicy != FailFast {
				policy = defaultPolicy
			}

			switch policy {
			case FailFast:
				logger.Log.Errorf("  ❌ 失败: %s (耗时: %v)", hook.Name, elapsed)
				return errMsg
			case ContinueOnError:
				logger.Log.Errorf("  ❌ 失败: %s (耗时: %v) - 继续执行", hook.Name, elapsed)
				errors = append(errors, errMsg)
			case WarnOnError:
				logger.Log.Warnf("  ⚠️  警告: %s (耗时: %v) - %v", hook.Name, elapsed, err)
			}
		} else {
			logger.Log.Infof("  ✓ 完成: %s (耗时: %v)", hook.Name, elapsed)
			successCount++
		}
	}

	totalElapsed := time.Since(startTime)

	// 汇总结果
	if len(errors) > 0 {
		logger.Log.Warnf("⚠️  初始化完成，但有 %d 个模块失败 (总耗时: %v)",
			len(errors), totalElapsed)
		logger.Log.Infof("📊 统计: 成功=%d, 失败=%d, 跳过=%d",
			successCount, len(errors), skippedCount)

		// 返回合并的错误
		return fmt.Errorf("以下模块初始化失败: %v", errors)
	}

	logger.Log.Infof("✅ 所有模块初始化完成 (总耗时: %v)", totalElapsed)
	logger.Log.Infof("📊 统计: 成功=%d, 跳过=%d", successCount, skippedCount)
	return nil
}

// GetRegistered 获取已注册的钩子列表（用于调试）
func GetRegistered() []Hook {
	hooksMu.Lock()
	defer hooksMu.Unlock()

	hooksCopy := make([]Hook, len(hooks))
	copy(hooksCopy, hooks)
	return hooksCopy
}

// Clear 清除所有钩子（用于测试）
func Clear() {
	hooksMu.Lock()
	defer hooksMu.Unlock()
	hooks = nil
}

// Count 返回已注册的钩子数量
func Count() int {
	hooksMu.Lock()
	defer hooksMu.Unlock()
	return len(hooks)
}
