"use client";

import { MousePointer2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";

import type { Issue } from "../../store/validation";
import { capabilitiesForKind, findCapability, findRuntime, rangeMessage, type CapabilityOption, type ParameterField, type RuntimeOption } from "../../v1/catalog";
import { CAPABILITY_REQUIRED_KINDS, KIND_META, type ObjectKind } from "../../v1/contract";
import { anchorsForFloor, floorOf, type GeometryInfo } from "../../v1/geometry";
import { messageAt, objectIssues } from "../../v1/issues";
import { localToGlb, quaternionToYaw, round3 } from "../../v1/matrix";
import type { ObjectView } from "../../v1/state";
import { NumberField, TextField } from "../fields";
import type { V1Actions } from "./actions";

const MAX_ANCHOR_OPTIONS = 200;

export type CatalogView = { loading: boolean; error: boolean; reload: () => void; runtimes: RuntimeOption[] };

export function V1ObjectForm({ object, issues, actions, geometry, catalog, runtimeVersion, pick, onOpenScenario }: {
  object: ObjectView | undefined;
  issues: Issue[];
  actions: V1Actions;
  geometry: GeometryInfo | null;
  catalog: CatalogView;
  runtimeVersion: string | undefined;
  pick: { name: string } | null;
  onOpenScenario: () => void;
}) {
  if (!object) {
    return <EmptyState icon={MousePointer2} title="Chưa chọn đối tượng" description="Chọn một đối tượng trong cây hoặc trên khung nhìn để chỉnh vị trí, neo, năng lực và tham số. Dùng công cụ “Đặt đối tượng” hoặc nút Thêm để tạo mới." />;
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
          {!floor && <option value={object.floorId}>{object.floorId ? `${object.floorId} (không có trong Geometry)` : "Chọn tầng…"}</option>}
          {geometry?.floors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
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
      <p className="ops-field-hint" data-testid="glb-position">
        {glb ? `Trong mô hình (GLB, Y hướng lên): ${round3(glb.x)}, ${round3(glb.y)}, ${round3(glb.z)} m.` : "Chưa tính được vị trí trong mô hình vì tầng không có trong Geometry."}
        {" "}Quay được lưu dưới dạng quaternion đơn vị ({object.rotation.x.toFixed(4)}, {object.rotation.y.toFixed(4)}, {object.rotation.z.toFixed(4)}, {object.rotation.w.toFixed(4)}).
        {!yaw.pure && " Hướng hiện có nghiêng ngoài trục đứng; nhập độ sẽ thay bằng xoay quanh trục đứng."}
      </p>
    </fieldset>

    {kind && <AnchorField object={object} kind={kind} geometry={geometry} error={messageAt(issues, `${base}.anchorId`)} actions={actions} pick={pick} />}
    {kind && <CapabilityField object={object} kind={kind} catalog={catalog} runtimeVersion={runtimeVersion} issues={issues} actions={actions} onOpenScenario={onOpenScenario} />}
  </div>;
}

function AnchorField({ object, kind, geometry, error, actions, pick }: { object: ObjectView; kind: ObjectKind; geometry: GeometryInfo | null; error: string | undefined; actions: V1Actions; pick: { name: string } | null }) {
  const [filter, setFilter] = useState("");
  const required = kind === "BlockedElement";
  const candidates = useMemo(() => anchorsForFloor(geometry, object.floorId), [geometry, object.floorId]);
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matches = needle ? candidates.filter((entry) => `${entry.semanticType} ${entry.nodeId} ${entry.ifcGlobalId}`.toLowerCase().includes(needle)) : candidates;
    return matches.slice(0, MAX_ANCHOR_OPTIONS);
  }, [candidates, filter]);
  const current = object.anchorId ? candidates.find((entry) => entry.ifcGlobalId === object.anchorId) : undefined;
  const picked = pick ? candidates.find((entry) => entry.nodeId === pick.name) : undefined;
  const pickedElsewhere = pick && !picked ? geometry?.semantic.find((entry) => entry.nodeId === pick.name) : undefined;

  return <fieldset className="ops-fieldset" data-testid="anchor-field">
    <legend>Cấu kiện neo (IFC) {required && <StatusBadge tone="warning">Bắt buộc</StatusBadge>}</legend>
    {candidates.length === 0
      ? <p className="ops-field-hint">{geometry ? "Tầng này chưa có cấu kiện nào trong ánh xạ ngữ nghĩa của Geometry nên chưa chọn được neo." : "Cần Geometry hợp lệ để chọn cấu kiện neo."}</p>
      : <>
        {candidates.length > 12 && <Field label="Lọc cấu kiện" hint={`${candidates.length} cấu kiện trên tầng này; hiển thị tối đa ${MAX_ANCHOR_OPTIONS}.`}>
          {(props) => <Input {...props} value={filter} onChange={(event) => setFilter(event.target.value)} autoComplete="off" spellCheck={false} />}
        </Field>}
        <Field label="Cấu kiện" required={required} error={error} hint="Chọn từ ánh xạ ngữ nghĩa của đúng tầng; IFC GlobalId được lưu làm anchorId.">
          {(props) => <Select {...props} data-testid="field-anchor" value={object.anchorId ?? ""} onChange={(event) => actions.setAnchor(object.index, event.target.value || undefined)}>
            <option value="">{required ? "Chọn cấu kiện…" : "Không neo"}</option>
            {object.anchorId && !current && !shown.some((entry) => entry.ifcGlobalId === object.anchorId) && <option value={object.anchorId}>{object.anchorId} (không thuộc tầng này)</option>}
            {current && !shown.some((entry) => entry.ifcGlobalId === current.ifcGlobalId) && <option value={current.ifcGlobalId}>{current.semanticType} · {current.nodeId}</option>}
            {shown.map((entry) => <option key={entry.ifcGlobalId} value={entry.ifcGlobalId}>{entry.semanticType} · {entry.nodeId}</option>)}
          </Select>}
        </Field>
        {picked && picked.ifcGlobalId !== object.anchorId && <div><Button type="button" variant="secondary" size="sm" data-testid="use-picked-anchor" onClick={() => actions.setAnchor(object.index, picked.ifcGlobalId)}>Dùng phần tử đang chọn trên mô hình ({picked.nodeId})</Button></div>}
        {pickedElsewhere && <p className="ops-field-hint">Phần tử đang chọn trên mô hình ({pickedElsewhere.nodeId}) thuộc tầng khác; neo phải cùng tầng với đối tượng.</p>}
      </>}
    {!required && object.anchorId && <div><Button type="button" variant="quiet" size="sm" onClick={() => actions.setAnchor(object.index, undefined)}>Bỏ neo</Button></div>}
  </fieldset>;
}

function CapabilityField({ object, kind, catalog, runtimeVersion, issues, actions, onOpenScenario }: { object: ObjectView; kind: ObjectKind; catalog: CatalogView; runtimeVersion: string | undefined; issues: Issue[]; actions: V1Actions; onOpenScenario: () => void }) {
  const required = (CAPABILITY_REQUIRED_KINDS as readonly ObjectKind[]).includes(kind);
  const base = `$.objects[${object.index}]`;
  const runtime = findRuntime(catalog.runtimes, runtimeVersion);
  const options = capabilitiesForKind(runtime, kind);
  const selected = findCapability(runtime, object.capability?.id);
  const error = messageAt(issues, `${base}.capability`) ?? messageAt(issues, `${base}.capability.id`) ?? messageAt(issues, `${base}.capability.version`);

  let guidance: React.ReactNode = null;
  if (catalog.loading) guidance = <p className="ops-field-hint" role="status">Đang đọc danh mục năng lực runtime…</p>;
  else if (catalog.error) guidance = <Alert tone="danger" title="Không tải được danh mục runtime" action={<Button type="button" size="sm" variant="secondary" onClick={catalog.reload}>Thử lại</Button>} />;
  else if (catalog.runtimes.length === 0) guidance = <Alert tone="warning" title="Danh mục runtime đang trống" ><span data-testid="catalog-empty">Chưa có runtime nào được công bố. Quản trị viên cần cấu hình runtime và capabilityContracts; editor không tự tạo năng lực. {required ? "Loại này bắt buộc có năng lực nên chưa hoàn thiện được." : ""}</span></Alert>;
  else if (!runtime) guidance = <p className="ops-field-hint">Chọn phiên bản runtime ở tab Kịch bản để xem năng lực. <Button type="button" variant="quiet" size="sm" onClick={onOpenScenario}>Mở tab Kịch bản</Button></p>;
  else if (options.length === 0) guidance = <Alert tone="warning" title={`Runtime ${runtime.runtimeVersion} chưa có năng lực cho ${KIND_META[kind].label.toLowerCase()}`}><span data-testid="no-capability">Runtime này chưa công bố capabilityContracts có objectKinds gồm {kind}. Chọn runtime khác hoặc nhờ quản trị viên công bố; editor không tự tạo năng lực.</span></Alert>;

  return <fieldset className="ops-fieldset" data-testid="capability-field">
    <legend>Năng lực runtime {required && <StatusBadge tone="warning">Bắt buộc</StatusBadge>}</legend>
    {guidance}
    {runtime && options.length > 0 && <Field label="Năng lực" required={required} error={error}
      hint={selected?.description ?? "Hành vi trong Unity do năng lực này quyết định, không do loại đối tượng."}>
      {(props) => <Select {...props} data-testid="field-capability" value={object.capability?.id ?? ""}
        onChange={(event) => {
          const next = options.find((option) => option.id === event.target.value);
          actions.setCapability(object.index, next ? { id: next.id, version: next.version } : undefined);
        }}>
        <option value="">{required ? "Chọn năng lực…" : "Không dùng năng lực"}</option>
        {object.capability && !options.some((option) => option.id === object.capability?.id) && <option value={object.capability.id}>{object.capability.id}@{object.capability.version} (không có trong runtime)</option>}
        {options.map((option) => <option key={option.id} value={option.id}>{option.id} · v{option.version}</option>)}
      </Select>}
    </Field>}
    {object.capability && !runtime && <p className="ops-field-hint">Đang dùng {object.capability.id}@{object.capability.version}; chọn runtime để kiểm tra.</p>}
    {selected && object.capability && selected.version !== object.capability.version && <div className="ops-stack">
      <Alert tone="warning" title="Phiên bản năng lực khác runtime">Đối tượng dùng v{object.capability.version}, runtime công bố v{selected.version}.</Alert>
      <div><Button type="button" size="sm" variant="secondary" data-testid="update-capability-version" onClick={() => actions.setCapability(object.index, { id: selected.id, version: selected.version })}>Cập nhật lên v{selected.version}</Button></div>
    </div>}
    {selected && <ParameterFields capability={selected} object={object} issues={issues} actions={actions} />}
    {!selected && !object.capability && Object.keys(object.parameters).length > 0 && <p className="ops-field-hint">Có tham số nhưng chưa chọn năng lực; máy chủ yêu cầu tham số rỗng khi không có năng lực.</p>}
  </fieldset>;
}

const optionLabel = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

function ParameterFields({ capability, object, issues, actions }: { capability: CapabilityOption; object: ObjectView; issues: Issue[]; actions: V1Actions }) {
  if (capability.fields.length === 0) return <p className="ops-field-hint" data-testid="no-parameters">Năng lực này không có tham số.</p>;
  return <div className="se-form" data-testid="parameter-fields">
    {capability.fields.map((field) => <ParameterInput key={`${object.index}-${capability.id}-${field.name}`} field={field} object={object} issues={issues} actions={actions} />)}
  </div>;
}

function hintOf(field: ParameterField): string | undefined {
  const parts: string[] = [];
  if (field.description) parts.push(field.description);
  if (field.minimum !== undefined || field.maximum !== undefined) parts.push(rangeMessage(field));
  if (field.type === "integer") parts.push("Số nguyên.");
  return parts.join(" ") || undefined;
}

function ParameterInput({ field, object, issues, actions }: { field: ParameterField; object: ObjectView; issues: Issue[]; actions: V1Actions }) {
  const value = object.parameters[field.name];
  const error = messageAt(issues, `$.objects[${object.index}].parameters.${field.name}`);
  const set = (next: Parameters<V1Actions["setParameter"]>[2], typing: boolean) => actions.setParameter(object.index, field.name, next, typing);
  const label = field.required ? field.name : `${field.name} (tùy chọn)`;

  if (field.enum) {
    const index = field.enum.findIndex((option) => option === value);
    return <Field label={label} required={field.required} error={error} hint={hintOf(field)}>
      {(props) => <Select {...props} data-testid={`param-${field.name}`} value={index >= 0 ? String(index) : ""} onChange={(event) => set(event.target.value === "" ? undefined : field.enum?.[Number(event.target.value)], false)}>
        <option value="">Chưa đặt</option>
        {value !== undefined && index < 0 && <option value="" disabled>{optionLabel(value)} (không có trong danh sách)</option>}
        {field.enum?.map((option, i) => <option key={i} value={String(i)}>{optionLabel(option)}</option>)}
      </Select>}
    </Field>;
  }
  if (field.type === "boolean") {
    return <Field label={label} required={field.required} error={error} hint={hintOf(field)}>
      {(props) => <Select {...props} data-testid={`param-${field.name}`} value={typeof value === "boolean" ? String(value) : ""} onChange={(event) => set(event.target.value === "" ? undefined : event.target.value === "true", false)}>
        <option value="">Chưa đặt</option>
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
