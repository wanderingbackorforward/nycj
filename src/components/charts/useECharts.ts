import { useEffect, useRef, RefObject } from "react";
import * as echarts from "echarts";

type EChartsOption = echarts.EChartsOption;

/**
 * 共享 ECharts hook — 替代 25 处重复的 init/setOption/resize/dispose 样板
 * 
 * @param option - ECharts 配置对象，变化时自动重新 setOption
 * @param ready  - 数据就绪条件，false 时不渲染
 * @param deps   - 额外的依赖数组（内部自动包含 option）
 */
export function useECharts(
  containerRef: RefObject<HTMLDivElement | null>,
  option: Record<string, unknown> | null,
  ready: boolean = true,
  deps: unknown[] = []
) {
  const instanceRef = useRef<echarts.ECharts | null>(null);

  // 初始化 / 更新图表
  useEffect(() => {
    if (!containerRef.current || !option || !ready) return;

    if (!instanceRef.current) {
      instanceRef.current = echarts.init(containerRef.current, "dark");
    }

    instanceRef.current.setOption(option, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);

  // resize 监听
  useEffect(() => {
    const h = () => instanceRef.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // 销毁
  useEffect(() => {
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  return instanceRef;
}