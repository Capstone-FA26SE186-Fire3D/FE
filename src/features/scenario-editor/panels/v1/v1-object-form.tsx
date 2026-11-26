"use client";

import { MousePointer2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { capabilityDescription, capabilityName, ifcTypeLabel, parameterHint, parameterLabel, parameterOptionLabel } from "@/configs/capability-labels";

import type { Issue } from "../../store/validation";
import { capabilityAllowed, type EditorScope } from "../../v1/scope";
import { capabilitiesForKind, findCapability, findRuntime, rangeMessage, type CapabilityOption, type ParameterField, type RuntimeOption } from "../../v1/catalog";
import { CAPABILITY_REQUIRED_KINDS, KIND_META, type ObjectKind } from "../../v1/contract";
import { anchorsForFloor, floorOf, type GeometryInfo } from "../../v1/geometry";
import { messageAt, objectIssues } from "../../v1/issues";
import { MOUNT_LABEL, WALL_HINT, heightProblem, heightText, mountingOf, sizeText, type Mounting } from "../../v1/equipment-mounting";
import { localToGlb, quaternionToYaw, round3 } from "../../v1/matrix";
import type { ObjectView } from "../../v1/state";
import { NumberField, TextField } from "../fields";
import type { V1Actions } from "./actions";

const MAX_ANCHOR_OPTIONS = 200;

export type CatalogView = { loading: boolean; error: boolean; reload: () => void; runtimes: RuntimeOption[] };

export function V1ObjectForm({ object, issues, actions, geometry, catalog, runtimeVersion, pick, onOpenScenario, scope = "scenario", onMount, wallGap }: {
  /** Puts the object the way its capability is mounted (onto the closest wall, at the right height). */
  onMount?: (index: number, capabilityId?: string) => void;
  /** Metres from a wall item to the closest wall; null when no wall is within reach; undefined when it does not apply. */
  wallGap?: number | null;
  object: ObjectView | undefined;
  issues: Issue[];
  actions: V1Actions;
  geometry: GeometryInfo | null;
  catalog: CatalogView;
  runtimeVersion: string | undefined;
  scope?: EditorScope;
  pick: { name: string } | null;
  onOpenScenario: () => void;
}) {
  if (!object) {
    return <EmptyState icon={MousePointer2} title="Chưa chọn đối tượng" description="Chọn một đối tượng trong cây hoặc trên khung nhìn để chỉnh vị trí, neo, khả năng và tham số. Dùng công cụ “Đặt đối tượng” hoặc nút Thêm để tạo mới." />;
  }
  const { index } = object;
  const base = `$.objects[${index}]`;
  const kind = object.kind;
  const meta = kind ? KIND_META[kind] : null;
  const floor = floorOf(geometry, object.floorId);
  const glb = floor ? localToGlb(floor.transform, object.position) : null;
  const yaw = quaternionToYaw(object.rotation);
  const mine = objectIssues(issues, index);
  const rendered = /^\$\.objects\[\d+\]\.(id|label|placement\.floorId|placement\.position(\.[xyz])?|placement\.rotation|anchorId|capability(\.(id|version))?|parameters\.[^.]+)$/;
  const unplaced = mine.filter((item) => !rendered.test(item.path));

  return <div className="se-form" data-testid="object-form" data-kind={kind ?? ""}>
    <div className="se-form-head">
      <div>
        <h3>{meta ? meta.label : "Đối tượng"} #{index + 1} <StatusBadge>{kind ?? "?"}</StatusBadge></h3>
        <p>{meta?.description}</p>
      </div>
      <Button type="button" variant="quiet" size="sm" onClick={() => actions.removeObject(index)} data-testid="delete-object"><Trash2 size={14} aria-hidden="true" /> Xóa</Button>
    </div>

    {unplaced.length > 0 && <Alert tone="danger" title="Vấn đề của đối tượng này">
      <ul className="ops-stack" style={{ margin: 0, paddingLeft: 18 }}>{unplaced.map((item) => <li key={`${item.code}${item.path}`}><code>{item.code}</code> {item.message}</li>)}</ul>
    </Alert>}

    <fieldset className="ops-fieldset">
      <legend>Nhận diện</legend>
      <TextField label="Mã đối tượng" required value={object.id} hint="Chữ, số và _ . : - ; duy nhất trong bản nháp." error={messageAt(issues, `${base}.id`)} data-testid="field-id"
        onCommit={(value) => actions.setField(["objects", index, "id"], value, "Đổi mã đối tượng")} maxLength={128} />
      <TextField label="Nhãn hiển thị" value={object.label} error={messageAt(issues, `${base}.label`)} data-testid="field-label" maxLength={255}
        onCommit={(value) => actions.setField(["objects", index, "label"], value === "" ? undefined : value, "Đổi nhãn")} />
    </fieldset>

    <fieldset className="ops-fieldset">
      <legend>Vị trí <StatusBadge>m · cục bộ theo tầng</StatusBadge></legend>
      <Field label="Tầng" required error={messageAt(issues, `${base}.placement.floorId`)}>
        {(props) => <Select {...props} data-testid="field-floor" value={object.floorId} onChange={(event) => actions.setFloor(index, event.target.value)}>
          {!floor && <option value={object.floorId}>{object.floorId ? `${object.floorId} (không có trong mô hình 3D)` : "Chọn tầng…"}</option>}
          {geometry?.floors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>}
      </Field>
      <div className="se-coord-grid">
        {(["x", "y", "z"] as const).map((axis) => (
          <NumberField key={`${index}-${axis}`} label={axis === "y" ? "Y (cao so với sàn tầng)" : axis.toUpperCase()} unit="m" data-testid={`coord-${axis}`}
            error={messageAt(issues, `${base}.placement.position.${axis}`)} value={object.position[axis]}
            onCommit={(value) => { if (value !== undefined) actions.setCoordinate(index, axis, value); }} />
        ))}
        <NumberField key={`${index}-yaw`} label="Hướng xoay quanh trục đứng" unit="độ" data-testid="field-yaw" error={messageAt(issues, `${base}.placement.rotation`)}
          value={round3(yaw.degrees)} onCommit={(value) => { if (value !== undefined) actions.setYaw(index, value); }} />
      </div>
      <p className="ops-field-hint" style={{ margin: 0 }} data-testid="drag-hint">Có thể cầm đối tượng trong khung nhìn rồi kéo để dời (công cụ Chọn). Thiết bị gắn tường trượt dọc mặt tường và luôn quay mặt trước vào phòng.</p>
      <p className="ops-field-hint" data-testid="glb-position">
        {glb ? `Trong mô hình (GLB, Y hướng lên): ${round3(glb.x)}, ${round3(glb.y)}, ${round3(glb.z)} m.` : "Chưa tính được vị trí trong mô hình vì tầng không có trong mô hình 3D."}
        {!yaw.pure && " Hướng hiện có nghiêng ngoài trục đứng; nhập độ sẽ thay bằng xoay quanh trục đứng."}
      </p>
    </fieldset>

    {kind === "Equipment" && mountingOf(object.capability?.id) && <MountingField object={object} mounting={mountingOf(object.capability?.id) as Mounting} wallGap={wallGap} onMount={onMount} />}
    {kind && <AnchorField object={object} kind={kind} geometry={geometry} error={messageAt(issues, `${base}.anchorId`)} actions={actions} pick={pick} />}
    {kind && <CapabilityField object={object} kind={kind} catalog={catalog} runtimeVersion={runtimeVersion} issues={issues} actions={actions} onOpenScenario={onOpenScenario} scope={scope} onChosen={onMount ? (capabilityId) => onMount(object.index, capabilityId) : undefined} />}
  </div>;
}

function AnchorField({ object, kind, geometry, error, actions, pick }: { object: ObjectView; kind: ObjectKind; geometry: GeometryInfo | null; error: string | undefined; actions: V1Actions; pick: { name: string } | null }) {
  const [filter, setFilter] = useState("");
  const required = kind === "BlockedElement";
  const candidates = useMemo(() => anchorsForFloor(geometry, object.floorId), [geometry, object.floorId]);
  // "Cửa 3" instead of the IFC type and GlobalId: numbered per kind of part on this floor, in the list's order.
  const names = useMemo(() => {
    const count = new Map<string, number>();
    return new Map(candidates.map((entry) => {
      const label = ifcTypeLabel(entry.semanticType);
      const n = (count.get(label) ?? 0) + 1;
      count.set(label, n);
      return [entry.ifcGlobalId, `${label} ${n}`] as const;
    }));
  }, [candidates]);
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matches = needle ? candidates.filter((entry) => `${names.get(entry.ifcGlobalId) ?? ""} ${entry.semanticType} ${entry.nodeId}`.toLowerCase().includes(needle)) : candidates;
    return matches.slice(0, MAX_ANCHOR_OPTIONS);
  }, [candidates, filter, names]);
  const current = object.anchorId ? candidates.find((entry) => entry.ifcGlobalId === object.anchorId) : undefined;
  const picked = pick ? candidates.find((entry) => entry.nodeId === pick.name) : undefined;
  const pickedElsewhere = pick && !picked ? geometry?.semantic.find((entry) => entry.nodeId === pick.name) : undefined;

  return <fieldset className="ops-fieldset" data-testid="anchor-field">
    <legend>Gắn vào bộ phận tòa nhà {required && <StatusBadge tone="warning">Bắt buộc</StatusBadge>}</legend>
    <p className="ops-field-hint">Gắn đối tượng vào một bộ phận có thật trong mô hình (cửa, cửa sổ, tường…), để ứng dụng biết đối tượng chính là bộ phận đó. Ví dụ: cửa bị chặn phải gắn vào đúng cái cửa.</p>
    {candidates.length === 0
      ? <p className="ops-field-hint">{geometry ? "Tầng này chưa có bộ phận nào gắn được." : "Cần mô hình 3D hợp lệ để chọn bộ phận."}</p>
      : <>
        {candidates.length > 12 && <Field label="Tìm bộ phận" hint={`Gõ “cửa”, “cửa sổ”… để thu gọn danh sách. Tầng này có ${candidates.length} bộ phận; danh sách hiện tối đa ${MAX_ANCHOR_OPTIONS}.`}>
          {(props) => <Input {...props} value={filter} onChange={(event) => setFilter(event.target.value)} autoComplete="off" spellCheck={false} />}
        </Field>}
        <Field label="Bộ phận" required={required} error={error} hint="Chỉ liệt kê bộ phận cùng tầng với đối tượng. Cũng có thể bấm vào bộ phận trên mô hình 3D.">
          {(props) => <Select {...props} data-testid="field-anchor" value={object.anchorId ?? ""} onChange={(event) => actions.setAnchor(object.index, event.target.value || undefined)}>
            <option value="">{required ? "Chọn bộ phận…" : "Không gắn"}</option>
            {object.anchorId && !current && !shown.some((entry) => entry.ifcGlobalId === object.anchorId) && <option value={object.anchorId}>Bộ phận ở tầng khác (chọn lại)</option>}
            {current && !shown.some((entry) => entry.ifcGlobalId === current.ifcGlobalId) && <option value={current.ifcGlobalId}>{names.get(current.ifcGlobalId)}</option>}
            {shown.map((entry) => <option key={entry.ifcGlobalId} value={entry.ifcGlobalId}>{names.get(entry.ifcGlobalId)}</option>)}
          </Select>}
        </Field>
        {picked && picked.ifcGlobalId !== object.anchorId && <div><Button type="button" variant="secondary" size="sm" data-testid="use-picked-anchor" onClick={() => actions.setAnchor(object.index, picked.ifcGlobalId)}>Gắn vào {names.get(picked.ifcGlobalId)?.toLowerCase()} vừa bấm trên mô hình</Button></div>}
        {pickedElsewhere && <p className="ops-field-hint">{ifcTypeLabel(pickedElsewhere.semanticType)} vừa bấm trên mô hình nằm ở tầng khác, nên không gắn được cho đối tượng ở tầng này.</p>}
      </>}
    {!required && object.anchorId && <div><Button type="button" variant="quiet" size="sm" onClick={() => actions.setAnchor(object.index, undefined)}>Bỏ gắn</Button></div>}
  </fieldset>;
}

/**
 * How the app will draw this Equipment: where it is mounted, how big it is and what the Y field means for it. The same
 * numbers draw the true-size shape in the viewport.
 */
function MountingField({ object, mounting, wallGap, onMount }: { object: ObjectView; mounting: Mounting; wallGap: number | null | undefined; onMount?: (index: number, capabilityId?: string) => void }) {
  const size = sizeText(mounting);
  const anchored = Boolean(object.anchorId);
  const problem = anchored ? null : heightProblem(mounting, object.position.y);
  const wall = mounting.mount === "wall" && !anchored;
  return <fieldset className="ops-fieldset" data-testid="mounting-field">
    <legend>Cách đặt trong ứng dụng</legend>
    <dl className="ops-stack" style={{ margin: 0, gap: 4 }}>
      <div><dt className="ops-field-hint" style={{ margin: 0 }}>Kiểu lắp</dt><dd style={{ margin: 0 }} data-testid="mounting-kind">{MOUNT_LABEL[mounting.mount]}</dd></div>
      {size && <div><dt className="ops-field-hint" style={{ margin: 0 }}>Kích thước (khoảng)</dt><dd style={{ margin: 0 }} data-testid="mounting-size">{size}</dd></div>}
      <div><dt className="ops-field-hint" style={{ margin: 0 }}>Chiều cao</dt><dd style={{ margin: 0 }} data-testid="mounting-height">{anchored ? "Đối tượng đang neo vào một cấu kiện của mô hình: vị trí và hướng lấy theo cấu kiện đó." : heightText(mounting)}</dd></div>
    </dl>
    {wall && <p className="ops-field-hint" style={{ margin: 0 }}>{WALL_HINT} Hộp mờ trong khung nhìn là kích thước thật của thiết bị.</p>}
    {problem && <Alert tone="warning"><span data-testid="mounting-height-problem">{problem}</span></Alert>}
    {wall && wallGap === null && <Alert tone="warning"><span data-testid="mounting-no-wall">Không thấy tường trong 1,5 m quanh thiết bị. Trong ứng dụng thiết bị sẽ lơ lửng giữa phòng.</span></Alert>}
    {wall && typeof wallGap === "number" && wallGap > 0.3 && <Alert tone="warning"><span data-testid="mounting-far-wall">Thiết bị đang cách tường gần nhất {String(Math.round(wallGap * 100) / 100).replace(".", ",")} m.</span></Alert>}
    {!anchored && onMount && (wall
      ? <div className="ops-actions"><Button type="button" size="sm" variant="secondary" data-testid="snap-wall" onClick={() => onMount(object.index)}>Áp vào tường gần nhất</Button></div>
      : problem && mounting.y.rule === "zero" && <div className="ops-actions"><Button type="button" size="sm" variant="secondary" data-testid="fix-height" onClick={() => onMount(object.index)}>Đặt Y về 0</Button></div>)}
  </fieldset>;
}

function CapabilityField({ object, kind, catalog, runtimeVersion, issues, actions, onOpenScenario, scope, onChosen }: { object: ObjectView; kind: ObjectKind; catalog: CatalogView; scope: EditorScope; runtimeVersion: string | undefined; issues: Issue[]; actions: V1Actions; onOpenScenario: () => void; onChosen?: (capabilityId: string) => void }) {
  const required = (CAPABILITY_REQUIRED_KINDS as readonly ObjectKind[]).includes(kind);
  const base = `$.objects[${object.index}]`;
  const runtime = findRuntime(catalog.runtimes, runtimeVersion);
  const options = capabilitiesForKind(runtime, kind).filter((option) => capabilityAllowed(scope, kind, option.id));
  const selected = findCapability(runtime, object.capability?.id);
  const error = messageAt(issues, `${base}.capability`) ?? messageAt(issues, `${base}.capability.id`) ?? messageAt(issues, `${base}.capability.version`);

  let guidance: React.ReactNode = null;
  if (catalog.loading) guidance = <p className="ops-field-hint" role="status">Đang tải danh sách khả năng của ứng dụng…</p>;
  else if (catalog.error) guidance = <Alert tone="danger" title="Không tải được danh sách khả năng của ứng dụng" action={<Button type="button" size="sm" variant="secondary" onClick={catalog.reload}>Thử lại</Button>} />;
  else if (catalog.runtimes.length === 0) guidance = <Alert tone="warning" title="Chưa có phiên bản ứng dụng nào" ><span data-testid="catalog-empty">Chưa có phiên bản ứng dụng nào được công bố. Quản trị FET3D cần cấu hình thêm; trình soạn không tự tạo khả năng. {required ? "Loại này bắt buộc chọn khả năng nên chưa hoàn thiện được." : ""}</span></Alert>;
  else if (!runtime) guidance = <p className="ops-field-hint">Chọn phiên bản ứng dụng ở tab Kịch bản để xem các khả năng. <Button type="button" variant="quiet" size="sm" onClick={onOpenScenario}>Mở tab Kịch bản</Button></p>;
  else if (options.length === 0 && !required) guidance = <p className="ops-field-hint" data-testid="no-capability">Loại đối tượng này không cần chọn khả năng; ứng dụng tự xử lý.</p>;
  else if (options.length === 0) guidance = <Alert tone="warning" title={`Phiên bản ứng dụng ${runtime.runtimeVersion} chưa có khả năng cho ${KIND_META[kind].lower}`}><span data-testid="no-capability">Phiên bản này chưa hỗ trợ {KIND_META[kind].lower}. Chọn phiên bản khác hoặc nhờ quản trị FET3D bổ sung; trình soạn không tự tạo khả năng.</span></Alert>;

  return <fieldset className="ops-fieldset" data-testid="capability-field">
    <legend>Khả năng trong ứng dụng {required && <StatusBadge tone="warning">Bắt buộc</StatusBadge>}</legend>
    {guidance}
    {runtime && options.length > 0 && <Field label="Khả năng" required={required} error={error}
      hint={(selected && capabilityDescription(selected.id)) ?? "Khả năng quyết định đối tượng hoạt động thế nào trong ứng dụng."}>
      {(props) => <Select {...props} data-testid="field-capability" value={object.capability?.id ?? ""}
        onChange={(event) => {
          const next = options.find((option) => option.id === event.target.value);
          actions.setCapability(object.index, next ? { id: next.id, version: next.version } : undefined);
          // A freshly chosen Equipment capability is put the way that equipment is mounted (wall, height).
          if (next && kind === "Equipment" && !object.anchorId) onChosen?.(next.id);
        }}>
        <option value="">{required ? "Chọn khả năng…" : "Không dùng khả năng"}</option>
        {object.capability && !options.some((option) => option.id === object.capability?.id) && <option value={object.capability.id}>{capabilityName(object.capability.id)} (phiên bản ứng dụng đang chọn không có)</option>}
        {options.map((option) => <option key={option.id} value={option.id}>{capabilityName(option.id)}</option>)}
      </Select>}
    </Field>}
    {object.capability && !runtime && <p className="ops-field-hint">Đang dùng {capabilityName(object.capability.id)}; chọn phiên bản ứng dụng để kiểm tra.</p>}
    {selected && object.capability && selected.version !== object.capability.version && <div className="ops-stack">
      <Alert tone="warning" title="Phiên bản khả năng khác với ứng dụng">Đối tượng dùng v{object.capability.version}, ứng dụng đang có v{selected.version}.</Alert>
      <div><Button type="button" size="sm" variant="secondary" data-testid="update-capability-version" onClick={() => actions.setCapability(object.index, { id: selected.id, version: selected.version })}>Cập nhật lên v{selected.version}</Button></div>
    </div>}
    {selected && <ParameterFields capability={selected} object={object} issues={issues} actions={actions} />}
    {!selected && !object.capability && Object.keys(object.parameters).length > 0 && <p className="ops-field-hint">Có tham số nhưng chưa chọn khả năng; khi không chọn khả năng thì phải bỏ hết tham số.</p>}
  </fieldset>;
}

function ParameterFields({ capability, object, issues, actions }: { capability: CapabilityOption; object: ObjectView; issues: Issue[]; actions: V1Actions }) {
  if (capability.fields.length === 0) return <p className="ops-field-hint" data-testid="no-parameters">Khả năng này không cần điền thêm gì.</p>;
  return <div className="se-form" data-testid="parameter-fields">
    {capability.fields.map((field) => <ParameterInput key={`${object.index}-${capability.id}-${field.name}`} field={field} object={object} issues={issues} actions={actions} />)}
  </div>;
}

function hintOf(field: ParameterField): string | undefined {
  const parts: string[] = [];
  const plain = parameterHint(field.name);
  if (plain) parts.push(plain);
  if (field.minimum !== undefined || field.maximum !== undefined) parts.push(rangeMessage(field));
  if (field.type === "integer") parts.push("Số nguyên.");
  return parts.join(" ") || undefined;
}

function ParameterInput({ field, object, issues, actions }: { field: ParameterField; object: ObjectView; issues: Issue[]; actions: V1Actions }) {
  const value = object.parameters[field.name];
  const error = messageAt(issues, `$.objects[${object.index}].parameters.${field.name}`);
  const set = (next: Parameters<V1Actions["setParameter"]>[2], typing: boolean) => actions.setParameter(object.index, field.name, next, typing);
  const label = field.required ? parameterLabel(field.name) : `${parameterLabel(field.name)} (tùy chọn)`;

  if (field.enum) {
    const index = field.enum.findIndex((option) => option === value);
    return <Field label={label} required={field.required} error={error} hint={hintOf(field)}>
      {(props) => <Select {...props} data-testid={`param-${field.name}`} value={index >= 0 ? String(index) : ""} onChange={(event) => set(event.target.value === "" ? undefined : field.enum?.[Number(event.target.value)], false)}>
        <option value="">Chọn…</option>
        {value !== undefined && index < 0 && <option value="" disabled>{parameterOptionLabel(value)} (không có trong danh sách)</option>}
        {field.enum?.map((option, i) => <option key={i} value={String(i)}>{parameterOptionLabel(option)}</option>)}
      </Select>}
    </Field>;
  }
  if (field.type === "boolean") {
    return <Field label={label} required={field.required} error={error} hint={hintOf(field)}>
      {(props) => <Select {...props} data-testid={`param-${field.name}`} value={typeof value === "boolean" ? String(value) : ""} onChange={(event) => set(event.target.value === "" ? undefined : event.target.value === "true", false)}>
        <option value="">Chọn…</option>
        <option value="true">Có</option>
        <option value="false">Không</option>
      </Select>}
    </Field>;
  }
  if (field.type === "string") {
    return <TextField label={label} required={field.required} error={error} hint={hintOf(field)} maxLength={field.maxLength} value={typeof value === "string" ? value : ""} data-testid={`param-${field.name}`}
      onCommit={(text) => set(text === "" ? undefined : text, true)} />;
  }
  return <NumberField label={label} required={field.required} error={error} hint={hintOf(field)} value={typeof value === "number" ? value : undefined} data-testid={`param-${field.name}`}
    onCommit={(number) => set(number, true)} />;
}
