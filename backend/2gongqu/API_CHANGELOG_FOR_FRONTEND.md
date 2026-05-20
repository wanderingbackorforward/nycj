# 2工区 API v1.0 → v1.5 变更清单（给前端）

---

## 零、基础信息（不变）

```
API_BASE_URL: http://120.55.70.218:80/api/area2
数据库:     shield_monitor / schema: shield_area2
环号范围:   1717~1749 (DK30+593.8 ~ DK30+542.6)
区间:       工农路站~天宁大道站 (宁扬线扬州段)
```

---

## 一、v1.0 原有端点（15个，全部保留不动）

### 1.1 健康与状态
| # | 端点 | 方法 | 说明 |
|---|------|------|------|
| 1 | `/health?level=basic` | GET | 基础存活检查 (2ms) |
| 2 | `/system-status` | GET | 数据库连接、表行数、view状态 |

### 1.2 指挥总览
| 3 | `/overview` | GET | 当前环号、参数/监测摘要、findings/actions |

### 1.3 环号
| 4 | `/rings` | GET | 33环列表 |
| 5 | `/rings/{ring_no}` | GET | 单环详情(参数分组+监测上下文) |

### 1.4 掘进参数
| 6 | `/tunneling/parameters?ring_no=&group=&limit=` | GET | 参数趋势 |
| 7 | `/tunneling/groups` | GET | 5个参数分组概览 |

### 1.5 监测
| 8 | `/monitoring/items` | GET | 12类监测项汇总 |
| 9 | `/monitoring/readings?point_code=&item=&limit=` | GET | 监测读数列表 |
| 10 | `/monitoring/summary` | GET | 监测总量+分布 |

### 1.6 诊断
| 11 | `/diagnosis/operation?ring_no=` | GET | 掘进参数分项诊断 |
| 12 | `/diagnosis/slurry-grouting?ring_no=` | GET | 泥水/注浆诊断 |

### 1.7 文档与证据
| 13 | `/documents` | GET | 37份源文件列表 |
| 14 | `/evidence?related_key=&ring_no=` | GET | 证据追溯 |

### 1.8 数据质量
| 15 | `/data-quality/summary` | GET | 数据质量分布 |

---

## 二、v1.1~v1.5 本轮新增端点（11个）

### 2.1 智能分析（v1.1）
| # | 端点 | 方法 | 用途 | 关键返回字段 |
|---|------|------|------|-------------|
| 16 | `/thresholds?target_type=monitoring` | GET | 查询46项阈值配置 | `design_limit_upper`, `warning_threshold`, `alarm_threshold`, `rate_warning`, `rate_alarm`, `derivation_method`, `confidence_cn` |
| 17 | `/analytics/overview` | GET | 全量超限分析 | `monitoring.total_readings/normal/warning/alarm`, `monitoring.by_item[]`, `tunneling.exceed_by_ring[]` |

### 2.2 系统配置（v1.2）
| 18 | `/config/ring-mileage` | GET | 33环里程推算表 | `configured`, `config.ring_width_m`, `rings[].chainage`, `rings[].mileage_m` |
| 19 | `/config/ring-mileage` | PUT | 设置起始环里程→自动填充全表 | body: `{starting_ring_no, starting_mileage_m, ring_width_m, direction}` |
| 20 | `/config/posture-deviation` | GET | 6类姿态偏差(GB50446) | `configured`, `configs[].deviation_name_cn`, `configs[].design_limit_mm` |
| 21 | `/config/posture-deviation/{type}` | PUT | 更新某类姿态限值 | type枚举: `horizontal_cutter/vertical_cutter/horizontal_tail/vertical_tail/roll/pitch` |

### 2.3 风险源（v1.3）
| 22 | `/risk-sources` | GET | 7个风险源台账 | `name`, `risk_category_cn`, `risk_level_cn`, `mileage_range`, `ring_range`, `control_surface_settlement_mm` |
| 23 | `/risk-sources/nearby?ring_no=1720` | GET | 查某环附近活跃风险源 | `nearby_risks[]`, `count` |
| 24 | `/risk-sources` | POST | 新增风险源 | body: `{name, risk_category, risk_level, start_ring_no, end_ring_no, ...}` |
| 25 | `/risk-sources/{id}` | PUT | 更新风险源 | |

### 2.4 监测坐标（v1.5）
| 26 | `/coordinates` | GET | 8个CGCS2000实测坐标 | `point_id`, `x_init`, `y_init`, `x_current`, `y_current`, `change_mm`, `cumulative_mm`, `instrument` |

---

## 三、原有端点返回字段增强（前端需感知的变更）

### 3.1 `/overview` 增强

```diff
+ "cards": [                          // 新增：4张指挥卡片
+   {"title":"监测报警","value":"1430","subtitle":"预警6889/正常107,452","level":"alarm"},
+   {"title":"当前环号","value":"1749","subtitle":"范围1717~1749","level":"normal"},
+   {"title":"掘进参数","value":"243,304","subtitle":"5分组/33环","level":"normal"},
+   {"title":"监测点数","value":"6,536","subtitle":"208,364条/12类","level":"normal"}
+ ]
  "position": {
    "currentRing": 1749,
    "ringRange": [1717, 1749],
+   "mileage": 30542.6,               // 新增：当前环里程(m)
+   "chainage": "DK30+542.600",       // 新增：当前环链号
-   "dataGap": "缺少环号-里程映射"    // 已闭合，现返回null
+   "dataGap": null
  },
+ "overallLevel": "alarm",            // 不再是"待确认"，基于真实数据
+ "headline": "监测发现1430条报警级读数(P99超限)..." // 动态生成
```

### 3.2 `/rings` 增强

```diff
  {
    "ring_no": 1717,
+   "mileage": 30593.8,               // 新增
+   "chainage": "DK30+593.800",       // 新增
    "parameter_count": 7156,
    "monitoring_context_count": 208364
  }
```

### 3.3 `/monitoring/items` 增强

```diff
  {
    "monitoring_item": "地表沉降",
    "point_count": 1643,
    "reading_count": 46747,
+   "normal_cnt": 44443,              // 新增：正常读数
+   "warning_cnt": 1834,              // 新增：预警读数
+   "alarm_cnt": 470,                 // 新增：报警读数
-   "status_display_cn": "待确认"     // 旧值
+   "status_display_cn": "报警"       // 基于实际状态
  }
```

### 3.4 `/monitoring/readings` 增强

```diff
  {
    "cumulative_change": -4.94,
    "status_code": "normal",
+   "threshold": {                     // 新增：阈值参考对象
+     "design_limit_upper": 4.648,
+     "warning_threshold": 4.648,
+     "alarm_threshold": 27.628,
+     "rate_warning": 0.23,
+     "rate_alarm": 0.4,
+     "derivation_method": "percentile_p95_p99",
+     "threshold_confidence": "medium"
+   }
  }
```

### 3.5 `/monitoring/summary` 增强

```diff
+ "alert_summary": {                  // 新增
+   "normal": 107452,
+   "warning": 6889,
+   "alarm": 1430
+ }
```

### 3.6 `/tunneling/parameters` 增强

```diff
  {
    "value": 13862.7,
    "status_code": "exceed_design_limit",
+   "threshold": {                     // 新增
+     "design_limit_lower": 0,
+     "design_limit_upper": 13862.7,
+     "derivation_method": "percentile_p05_p95",
+     "threshold_confidence": "medium"
+   }
  }
```

### 3.7 `/tunneling/groups` 增强

```diff
  {
    "group_code": "advance",
+   "normal_count": 7156,             // 新增
+   "exceed_count": 17,               // 新增
  }
```

### 3.8 `/system-status` 增强

```diff
+ "alertStatus": {                    // 新增
+   "normal": 107452,
+   "warning": 6889,
+   "alarm": 1430,
+   "unknown": 665,
+   "thresholdConfigCount": 46,
+   "thresholdSource": "统计推导(P95/P99)"
+ },
+ "gapStatus": {                      // 新增：6缺口实时状态
+   "G1_monitoring_threshold": {"status":"resolved","detail":"46项统计阈值已推导"},
+   "G2_ring_mileage": {"status":"resolved","detail":"33环已标注里程"},
+   "G3_cad_registration": {"status":"infrastructure_ready","detail":"CAD表已扩展坐标字段"},
+   "G4_risk_source": {"status":"resolved","detail":"从周报提取7个风险源"},
+   "G5_posture_deviation": {"status":"resolved","detail":"GB50446填充6/6项"},
+   "G6_slurry_circulation": {"status":"infrastructure_ready","detail":"环流表就绪,需PLC数据"}
+ }
```

### 3.9 `/data-quality/summary` 增强

```diff
+ "thresholdConfigCount": 46,
+ "thresholdDerivationMethod": "percentile_p95_p99",
+ "thresholdConfidence": "medium (统计推导, 非设计值)",
+ "alertCoverageRate": 55.6,          // 新增：监测覆盖率

  "dataGaps": [
-   {"field":"threshold","reason":"日报缺少阈值","impact":"status_code全unknown"}
+   {"field":"threshold_source","reason":"阈值为统计推导,非工程设计值",
+    "impact":"建议从设计方案补充正式限值","status":"部分解决"}
+   {"field":"mileage","reason":"缺少环号-里程映射","status":"P1"}
+   {"field":"cad_geo","reason":"CAD仅登记未配准","status":"P2"}
+   {"field":"risk_source","reason":"缺少风险源台账","status":"P3"}
+   {"field":"posture_deviation","reason":"缺少正式姿态偏差限值","status":"P2"}
+   {"field":"slurry_circulation","reason":"缺少泥水环流参数","status":"P2"}
  ]
```

### 3.10 `/health` 增强

```diff
- {"ok":true,"database":"connected","schema":"shield_area2","tables":{...},"views":{...}}
+ 支持 ?level=basic|standard|deep
+ basic:  {"ok":true,"level":"basic","elapsed_ms":0.0}
+ deep:   {"ok":true,...,"pool":{"total_queries":1234,"slow_queries":5,...},"db_latency_ms":1.2}
```

### 3.11 所有端点新增响应头

```
X-Response-Time-Ms: 1337.6          // 服务端处理时长(ms)
X-Slow-Query: 1                     // 超过3秒时出现
X-Very-Slow: 1                      // 超过10秒时出现
```

---

## 四、前端建议改造

### 4.1 指挥总览页（优先）

```
1. 渲染 cards[4] → 顶部4个指标卡片（报警数/当前环号/参数量/监测点）
2. overallLevel/alarm 时卡片红色闪烁
3. position.chainage 显示在"当前位置"栏
4. headline 显示在页面顶部（不再硬编码"待确认"）
5. 调用 /analytics/overview 获取 monitoring.by_item[] → 渲染监测项超限排名表
6. 调用 /risk-sources/nearby?ring_no=当前环 → 渲染"附近风险源"模块
```

### 4.2 监测异常页

```
1. 调用 /monitoring/items → 用 normal_cnt/warning_cnt/alarm_cnt 渲染红绿灯
2. 调用 /monitoring/readings → 每条返回的 threshold 对象 → 在图表上画阈值参考线
3. 调用 /analytics/overview → monitoring.by_item[] → hover 显示各监测项 alarm/warning 数
```

### 4.3 参数诊断页

```
1. 调用 /tunneling/groups → 用 normal_count/exceed_count 标红超限项
2. 调用 /tunneling/parameters → threshold 对象 → 在图表上画 P05/P95 参考线
3. 调用 /config/posture-deviation → 显示6类姿态偏差限值配置表
```

### 4.4 数据接入状态页

```
1. 调用 /system-status → gapStatus → 渲染6缺口状态卡片(绿/黄/红)
2. 调用 /data-quality/summary → alertCoverageRate → 大数字显示
3. 调用 /coordinates → 列表渲染8个GPS坐标点
4. 调用 /risk-sources → 渲染风险源台账表
```

### 4.5 通用建议

```
1. 请求头: 观察 X-Response-Time-Ms, 超过3秒给用户loading提示
2. 慢端点: /overview (~1.3s), /rings (~0.2s), /analytics/overview (~6s)
3. 阈值展示: 所有 threshold 对象都标注 derivation_method 和 confidence
   - percentile_p95_p99 + medium → 标注"统计推导"
   - original_excel + high → 标注"原始设计值"
4. 中文映射: 所有 *_cn 后缀字段直接用于展示, 不用 code 字段
5. 环号输入: 前端可提供 PUT /config/ring-mileage 的管理界面
```

---

## 五、端点速查表（26个）

| # | 端点 | 新增/原有 | 用途 |
|---|------|----------|------|
| 1 | `/health` | 原有★增强 | 分级健康检查 |
| 2 | `/system-status` | 原有★增强 | 系统状态+缺口 |
| 3 | `/overview` | 原有★增强 | 指挥总览 |
| 4 | `/rings` | 原有★增强 | 环号列表(含里程) |
| 5 | `/rings/{id}` | 原有 | 环号详情 |
| 6 | `/tunneling/parameters` | 原有★增强 | 掘进参数(含阈值) |
| 7 | `/tunneling/groups` | 原有★增强 | 参数分组(含超限) |
| 8 | `/monitoring/items` | 原有★增强 | 监测项(含报警数) |
| 9 | `/monitoring/readings` | 原有★增强 | 监测读数(含阈值) |
| 10 | `/monitoring/summary` | 原有★增强 | 监测汇总(含alert) |
| 11 | `/diagnosis/operation` | 原有 | 掘进诊断 |
| 12 | `/diagnosis/slurry-grouting` | 原有 | 泥水注浆诊断 |
| 13 | `/documents` | 原有 | 源文件列表 |
| 14 | `/evidence` | 原有 | 证据追溯 |
| 15 | `/data-quality/summary` | 原有★增强 | 数据质量(含缺口) |
| 16 | `/thresholds` | **新增** | 阈值配置查询 |
| 17 | `/analytics/overview` | **新增** | 全量超限分析 |
| 18 | `/config/ring-mileage` | **新增** | 环号里程配置 |
| 19 | `/config/posture-deviation` | **新增** | 姿态偏差配置 |
| 20 | `/risk-sources` | **新增** | 风险源台账 |
| 21 | `/risk-sources/nearby` | **新增** | 附近风险源 |
| 22 | `/coordinates` | **新增** | GPS坐标 |

> 注：16-22的新增里，部分含 PUT/POST 变体，实际端点数为 26。