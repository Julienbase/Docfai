import React, { useState, useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  ReactFlowProvider,
  Panel,
  BackgroundVariant,
  ReactFlowInstance,
  MarkerType,
  Handle,
  Position,
  EdgeProps,
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  NodeResizer,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  X, Save, Square, Circle, Type, Trash2, Plus,
  ArrowRight, Minus, GitBranch, Palette, Copy,
  ZoomIn, ZoomOut, Maximize2, Undo2, Redo2,
  Moon, Sun, Sparkles, Search, Diamond,
  Triangle, Hexagon, Octagon, Database, Cloud,
  Dot, LayoutTemplate, Grid3x3, Wand2, ChevronLeft
} from 'lucide-react';
import { toPng } from 'html-to-image';

interface FlowDiagramEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (diagramData: {
    id: string;
    title: string;
    jsonPath: string;
    imagePath: string;
    elements: any[];
    appState: any;
  }) => void;
  initialData?: {
    elements: any[];
    appState: any;
    title: string;
    id: string;
  };
  projectPath?: string;
  stepNumber?: number;
}

// Shared handle styling so every shape's connection points match StartNode/ProcessNode
// (white-bordered slate dots with a soft shadow) instead of ReactFlow's tiny defaults.
const HANDLE_STYLE: React.CSSProperties = {
  background: '#94a3b8',
  width: '10px',
  height: '10px',
  border: '2px solid white',
  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
};

// Editable Node Wrapper
function EditableNode({ data, style, children }: any) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [label, setLabel] = React.useState(data.label);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => setIsEditing(true);

  const handleBlur = () => {
    setIsEditing(false);
    if (data.onLabelChange) {
      data.onLabelChange(label);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setLabel(data.label);
      setIsEditing(false);
    }
  };

  return (
    <div style={style} onDoubleClick={handleDoubleClick}>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            background: 'white',
            border: '1px solid #3b82f6',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '14px',
            fontWeight: 500,
            textAlign: 'center',
            width: '100%',
            outline: 'none',
          }}
        />
      ) : (
        children
      )}
    </div>
  );
}

// Additional shape nodes
function TriangleNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [label, setLabel] = React.useState(data.label);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => setIsEditing(true);

  const handleBlur = () => {
    setIsEditing(false);
    if (data.onLabelChange) {
      data.onLabelChange(label);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setLabel(data.label);
      setIsEditing(false);
    }
  };

  return (
    <>
      <NodeResizer
        color="#8b5cf6"
        isVisible={selected}
        minWidth={60}
        minHeight={60}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle type="target" position={Position.Top} id="top" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left" style={HANDLE_STYLE} />
      <div style={{ position: 'relative', width: '100%', height: '100%' }} onDoubleClick={handleDoubleClick}>
        <svg width="100%" height="100%" viewBox="0 0 100 100">
          <polygon
            points="50,10 90,90 10,90"
            fill={data.color || 'white'}
            stroke={data.borderColor || '#8b5cf6'}
            strokeWidth="2"
            style={{
              filter: selected ? 'drop-shadow(0 0 4px #3b82f6)' : 'none',
            }}
          />
          {!isEditing && (
            <text
              x="50"
              y="70"
              textAnchor="middle"
              fill="#1e293b"
              fontSize="14"
              fontWeight="500"
            >
              {data.label}
            </text>
          )}
        </svg>
        {isEditing && (
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '14px',
              fontWeight: 500,
              textAlign: 'center',
              width: '80px',
              outline: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right" style={HANDLE_STYLE} />
    </>
  );
}

// Document Node (for reports, documents)
function DocumentNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [label, setLabel] = React.useState(data.label);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => setIsEditing(true);
  const handleBlur = () => {
    setIsEditing(false);
    if (data.onLabelChange) {
      data.onLabelChange(label);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlur();
    else if (e.key === 'Escape') {
      setLabel(data.label);
      setIsEditing(false);
    }
  };

  return (
    <>
      <NodeResizer
        color="#ec4899"
        isVisible={selected}
        minWidth={100}
        minHeight={60}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <div style={{ position: 'relative', width: '100%', height: '100%' }} onDoubleClick={handleDoubleClick}>
        <svg width="100%" height="100%" viewBox="0 0 140 90">
          <path
            d="M 10,10 L 130,10 L 130,70 Q 120,80 110,70 Q 100,60 90,70 Q 80,80 70,70 Q 60,60 50,70 Q 40,80 30,70 Q 20,60 10,70 Z"
            fill={data.color || 'white'}
            stroke={data.borderColor || '#cbd5e1'}
            strokeWidth="2"
            style={{
              filter: selected ? 'drop-shadow(0 0 4px #3b82f6)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.05))',
            }}
          />
          {!isEditing && (
            <text
              x="70"
              y="45"
              textAnchor="middle"
              fill="#1e293b"
              fontSize="14"
              fontWeight="500"
            >
              {data.label}
            </text>
          )}
        </svg>
        {isEditing && (
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              position: 'absolute',
              top: '40%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '14px',
              fontWeight: 500,
              textAlign: 'center',
              width: '100px',
              outline: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
    </>
  );
}

function HexagonNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [label, setLabel] = React.useState(data.label);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => setIsEditing(true);
  const handleBlur = () => {
    setIsEditing(false);
    if (data.onLabelChange) {
      data.onLabelChange(label);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlur();
    else if (e.key === 'Escape') {
      setLabel(data.label);
      setIsEditing(false);
    }
  };

  return (
    <>
      <NodeResizer
        color="#14b8a6"
        isVisible={selected}
        minWidth={100}
        minHeight={60}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle type="target" position={Position.Top} id="top" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left" style={HANDLE_STYLE} />
      <div style={{ position: 'relative', width: '100%', height: '100%' }} onDoubleClick={handleDoubleClick}>
        <svg width="100%" height="100%" viewBox="0 0 140 80">
          <polygon
            points="30,10 110,10 130,40 110,70 30,70 10,40"
            fill={data.color || 'white'}
            stroke={data.borderColor || '#14b8a6'}
            strokeWidth="2"
            style={{
              filter: selected ? 'drop-shadow(0 0 4px #3b82f6)' : 'none',
            }}
          />
          {!isEditing && (
            <text
              x="70"
              y="45"
              textAnchor="middle"
              fill="#1e293b"
              fontSize="14"
              fontWeight="500"
            >
              {data.label}
            </text>
          )}
        </svg>
        {isEditing && (
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '14px',
              fontWeight: 500,
              textAlign: 'center',
              width: '100px',
              outline: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right" style={HANDLE_STYLE} />
    </>
  );
}

function OctagonNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [label, setLabel] = React.useState(data.label);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => setIsEditing(true);
  const handleBlur = () => {
    setIsEditing(false);
    if (data.onLabelChange) {
      data.onLabelChange(label);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlur();
    else if (e.key === 'Escape') {
      setLabel(data.label);
      setIsEditing(false);
    }
  };

  return (
    <>
      <NodeResizer
        color="#ef4444"
        isVisible={selected}
        minWidth={80}
        minHeight={80}
        keepAspectRatio
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle type="target" position={Position.Top} id="top" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left" style={HANDLE_STYLE} />
      <div style={{ position: 'relative', width: '100%', height: '100%' }} onDoubleClick={handleDoubleClick}>
        <svg width="100%" height="100%" viewBox="0 0 120 120">
          <polygon
            points="40,10 80,10 110,40 110,80 80,110 40,110 10,80 10,40"
            fill={data.color || 'white'}
            stroke={data.borderColor || '#ef4444'}
            strokeWidth="2"
            style={{
              filter: selected ? 'drop-shadow(0 0 4px #3b82f6)' : 'none',
            }}
          />
          {!isEditing && (
            <text
              x="60"
              y="65"
              textAnchor="middle"
              fill="#1e293b"
              fontSize="14"
              fontWeight="500"
            >
              {data.label}
            </text>
          )}
        </svg>
        {isEditing && (
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '14px',
              fontWeight: 500,
              textAlign: 'center',
              width: '90px',
              outline: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right" style={HANDLE_STYLE} />
    </>
  );
}

function TrapezoidNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [label, setLabel] = React.useState(data.label);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => setIsEditing(true);
  const handleBlur = () => {
    setIsEditing(false);
    if (data.onLabelChange) {
      data.onLabelChange(label);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlur();
    else if (e.key === 'Escape') {
      setLabel(data.label);
      setIsEditing(false);
    }
  };

  return (
    <>
      <NodeResizer
        color="#f59e0b"
        isVisible={selected}
        minWidth={100}
        minHeight={60}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle type="target" position={Position.Top} id="top" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left" style={HANDLE_STYLE} />
      <div style={{ position: 'relative', width: '100%', height: '100%' }} onDoubleClick={handleDoubleClick}>
        <svg width="100%" height="100%" viewBox="0 0 140 80">
          <polygon
            points="20,10 120,10 140,70 0,70"
            fill={data.color || 'white'}
            stroke={data.borderColor || '#f59e0b'}
            strokeWidth="2"
            style={{
              filter: selected ? 'drop-shadow(0 0 4px #3b82f6)' : 'none',
            }}
          />
          {!isEditing && (
            <text
              x="70"
              y="45"
              textAnchor="middle"
              fill="#1e293b"
              fontSize="14"
              fontWeight="500"
            >
              {data.label}
            </text>
          )}
        </svg>
        {isEditing && (
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '14px',
              fontWeight: 500,
              textAlign: 'center',
              width: '100px',
              outline: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right" style={HANDLE_STYLE} />
    </>
  );
}

// Custom Edge Components
function ButtonEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onEdgeClick = () => {
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={onEdgeClick}
            className="w-5 h-5 bg-white border-2 border-gray-400 rounded-full cursor-pointer text-xs hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors flex items-center justify-center"
            title="Delete edge"
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function LabeledEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data, label }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [isEditing, setIsEditing] = React.useState(false);
  const [editLabel, setEditLabel] = React.useState(label || data?.label || 'Label');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    setEdges((edges) =>
      edges.map((edge) =>
        edge.id === id
          ? { ...edge, label: editLabel, data: { ...edge.data, label: editLabel } }
          : edge
      )
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setEditLabel(label || data?.label || 'Label');
      setIsEditing(false);
    }
  };

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onDoubleClick={handleDoubleClick}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="bg-white px-2 py-1 rounded border-2 border-blue-500 text-xs font-medium shadow-sm outline-none"
              style={{ minWidth: '60px' }}
            />
          ) : (
            <div className="bg-white px-2 py-1 rounded border border-gray-300 text-xs font-medium shadow-sm cursor-text hover:border-gray-400">
              {editLabel}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function AnimatedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: '#3b82f6',
        }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="url(#animated-gradient)"
        strokeWidth={2}
        strokeDasharray="5 5"
        className="animate-dash"
      />
      <defs>
        <linearGradient id="animated-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </>
  );
}

// Edge types
const edgeTypes = {
  button: ButtonEdge,
  labeled: LabeledEdge,
  animated: AnimatedEdge,
};

// Custom node types for flowcharts
const nodeTypes = {
  process: ProcessNode,
  start: StartNode,
  end: EndNode,
  document: DocumentNode,
  decision: DecisionNode,
  triangle: TriangleNode,
  hexagon: HexagonNode,
  octagon: OctagonNode,
  trapezoid: TrapezoidNode,
  inputOutput: InputOutputNode,
  database: DatabaseNode,
  cloud: CloudNode,
  connector: ConnectorNode,
};

// Default labels for newly-placed nodes (overrides the capitalized-tool-name fallback)
const DEFAULT_NODE_LABELS: Record<string, string> = {
  connector: '',
  inputOutput: 'Input / Output',
  decision: 'Decision?',
  process: 'Process',
  start: 'Start',
  end: 'End',
};

// Default dimensions for shapes that need an explicit size to render correctly
// when first placed (diamond must be wide enough; connector is a small dot).
const DEFAULT_NODE_SIZE: Record<string, { width: number; height: number }> = {
  decision: { width: 140, height: 100 },
  connector: { width: 24, height: 24 },
  database: { width: 110, height: 120 },
  cloud: { width: 140, height: 90 },
  octagon: { width: 120, height: 120 },
};

// Shape catalog for the searchable shape panel.
// `tool` matches the node `type` registered in nodeTypes / the selectedTool union.
type ShapeCategory = 'Flow' | 'Shapes' | 'Data' | 'Annotation';
interface ShapeCatalogEntry {
  tool: string;
  label: string;
  category: ShapeCategory;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
}
const SHAPE_CATALOG: ShapeCatalogEntry[] = [
  { tool: 'start', label: 'Start', category: 'Flow', keywords: 'start begin entry terminator', icon: Circle },
  { tool: 'end', label: 'End', category: 'Flow', keywords: 'end stop finish terminator', icon: Circle },
  { tool: 'process', label: 'Process', category: 'Flow', keywords: 'process step action rectangle box', icon: Square },
  { tool: 'decision', label: 'Decision', category: 'Flow', keywords: 'decision branch condition if diamond yes no', icon: Diamond },
  { tool: 'inputOutput', label: 'Input / Output', category: 'Flow', keywords: 'input output data parallelogram io', icon: ArrowRight },
  { tool: 'connector', label: 'Connector', category: 'Flow', keywords: 'connector join merge dot circle', icon: Dot },
  { tool: 'triangle', label: 'Triangle', category: 'Shapes', keywords: 'triangle shape', icon: Triangle },
  { tool: 'hexagon', label: 'Hexagon', category: 'Shapes', keywords: 'hexagon preparation shape', icon: Hexagon },
  { tool: 'octagon', label: 'Octagon', category: 'Shapes', keywords: 'octagon stop shape', icon: Octagon },
  { tool: 'trapezoid', label: 'Trapezoid', category: 'Shapes', keywords: 'trapezoid manual operation shape', icon: Square },
  { tool: 'database', label: 'Database', category: 'Data', keywords: 'database cylinder storage data store', icon: Database },
  { tool: 'cloud', label: 'Cloud', category: 'Data', keywords: 'cloud service external', icon: Cloud },
  { tool: 'document', label: 'Document', category: 'Data', keywords: 'document report file paper', icon: Square },
];

// Starter templates. Each is a self-contained set of nodes + edges loaded onto the canvas.
interface DiagramTemplate {
  id: string;
  name: string;
  description: string;
  build: () => { nodes: Node[]; edges: Edge[] };
}
const mkNode = (id: string, type: string, label: string, x: number, y: number): Node => ({
  id,
  type,
  position: { x, y },
  data: { label },
  ...(DEFAULT_NODE_SIZE[type] ? { style: { width: DEFAULT_NODE_SIZE[type].width, height: DEFAULT_NODE_SIZE[type].height } } : {}),
});
// Template edges MUST specify sourceHandle/targetHandle. The shape nodes expose
// separate handles (top/left as targets, bottom/right as sources); an edge with
// no handle id binds ambiguously and fails to render reliably (e.g. in PNG export).
const mkEdge = (
  id: string,
  source: string,
  target: string,
  label?: string,
  sourceHandle: string = 'bottom',
  targetHandle: string = 'top'
): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  type: label ? 'labeled' : 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed },
  // An inline stroke style is REQUIRED. ReactFlow's default edge stroke comes
  // from its external stylesheet, which html-to-image does not reliably clone
  // during PNG export — so an edge with no inline style renders on the live
  // canvas but is invisible (stroke: none) in the saved image.
  style: { strokeWidth: 2, stroke: '#64748b' },
  ...(label ? { label, data: { label } } : {}),
});
const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'linear',
    name: 'Linear process',
    description: 'Start → three steps → end',
    build: () => ({
      nodes: [
        mkNode('t-start', 'start', 'Start', 0, 0),
        mkNode('t-s1', 'process', 'Step 1', 0, 120),
        mkNode('t-s2', 'process', 'Step 2', 0, 240),
        mkNode('t-s3', 'process', 'Step 3', 0, 360),
        mkNode('t-end', 'end', 'End', 0, 480),
      ],
      edges: [
        mkEdge('t-e1', 't-start', 't-s1'),
        mkEdge('t-e2', 't-s1', 't-s2'),
        mkEdge('t-e3', 't-s2', 't-s3'),
        mkEdge('t-e4', 't-s3', 't-end'),
      ],
    }),
  },
  {
    id: 'decision',
    name: 'Decision branch',
    description: 'A decision splitting into Yes / No paths',
    build: () => ({
      nodes: [
        mkNode('t-start', 'start', 'Start', 160, 0),
        mkNode('t-dec', 'decision', 'Decision?', 150, 130),
        mkNode('t-yes', 'process', 'Yes path', 0, 300),
        mkNode('t-no', 'process', 'No path', 340, 300),
        mkNode('t-end', 'end', 'End', 160, 440),
      ],
      edges: [
        mkEdge('t-e1', 't-start', 't-dec'),
        // Decision diamond exposes source handles on `bottom` and `right`
        mkEdge('t-e2', 't-dec', 't-yes', 'Yes', 'bottom', 'top'),
        mkEdge('t-e3', 't-dec', 't-no', 'No', 'right', 'top'),
        mkEdge('t-e4', 't-yes', 't-end'),
        mkEdge('t-e5', 't-no', 't-end'),
      ],
    }),
  },
  {
    id: 'approval',
    name: 'Approval workflow',
    description: 'Submit → review → approve / reject loop',
    build: () => ({
      nodes: [
        mkNode('t-start', 'start', 'Submit request', 160, 0),
        mkNode('t-review', 'process', 'Review', 160, 130),
        mkNode('t-dec', 'decision', 'Approved?', 150, 260),
        mkNode('t-approve', 'process', 'Notify approval', 360, 420),
        mkNode('t-reject', 'process', 'Request changes', -40, 420),
        mkNode('t-end', 'end', 'Done', 360, 560),
      ],
      edges: [
        mkEdge('t-e1', 't-start', 't-review'),
        mkEdge('t-e2', 't-review', 't-dec'),
        mkEdge('t-e3', 't-dec', 't-approve', 'Yes', 'right', 'top'),
        mkEdge('t-e4', 't-dec', 't-reject', 'No', 'bottom', 'top'),
        // Reject loops back up into Review's left side
        mkEdge('t-e5', 't-reject', 't-review', undefined, 'top', 'left'),
        mkEdge('t-e6', 't-approve', 't-end'),
      ],
    }),
  },
  {
    id: 'stages',
    name: 'Staged process',
    description: 'Four sequential stages with a data store',
    build: () => ({
      nodes: [
        mkNode('t-s1', 'process', 'Intake', 0, 0),
        mkNode('t-s2', 'process', 'Process', 0, 130),
        mkNode('t-s3', 'process', 'Validate', 0, 260),
        mkNode('t-db', 'database', 'Store', 240, 260),
        mkNode('t-s4', 'process', 'Deliver', 0, 390),
      ],
      edges: [
        mkEdge('t-e1', 't-s1', 't-s2'),
        mkEdge('t-e2', 't-s2', 't-s3'),
        mkEdge('t-e3', 't-s3', 't-s4'),
        // Validate writes sideways into the Store database
        mkEdge('t-e4', 't-s3', 't-db', undefined, 'right', 'left'),
      ],
    }),
  },
];

// Dependency-free layered auto-layout ("tidy up").
// Assigns each node a rank by longest path from a root, then spreads ranks
// vertically and siblings horizontally. Avoids pulling in dagre (deprecated,
// CVE-2025-57347 prototype-pollution in the ecosystem).
function layeredLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const RANK_GAP = 140;
  const COL_GAP = 220;

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  nodes.forEach((n) => {
    incoming.set(n.id, 0);
    outgoing.set(n.id, []);
  });
  edges.forEach((e) => {
    if (incoming.has(e.target) && outgoing.has(e.source)) {
      incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
      outgoing.get(e.source)!.push(e.target);
    }
  });

  // Roots: nodes with no incoming edge (fall back to first node if none).
  const roots = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  const seeds = roots.length > 0 ? roots : [nodes[0]];

  // BFS rank assignment; a node sits one rank below its deepest predecessor.
  const rank = new Map<string, number>();
  const queue: string[] = seeds.map((n) => n.id);
  seeds.forEach((n) => rank.set(n.id, 0));
  let guard = 0;
  const maxIterations = nodes.length * edges.length + nodes.length + 1;
  while (queue.length > 0 && guard++ < maxIterations) {
    const id = queue.shift()!;
    const r = rank.get(id) ?? 0;
    for (const child of outgoing.get(id) ?? []) {
      const childRank = rank.get(child);
      if (childRank === undefined || childRank < r + 1) {
        rank.set(child, r + 1);
        queue.push(child);
      }
    }
  }
  // Disconnected nodes get rank 0.
  nodes.forEach((n) => {
    if (!rank.has(n.id)) rank.set(n.id, 0);
  });

  // Group by rank and spread horizontally, centered.
  const byRank = new Map<number, string[]>();
  nodes.forEach((n) => {
    const r = rank.get(n.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n.id);
  });

  const positions = new Map<string, { x: number; y: number }>();
  byRank.forEach((ids, r) => {
    const rowWidth = (ids.length - 1) * COL_GAP;
    ids.forEach((id, i) => {
      positions.set(id, { x: i * COL_GAP - rowWidth / 2, y: r * RANK_GAP });
    });
  });

  return nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
  }));
}

// Custom Process Node (Rectangle)
function ProcessNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <>
      <NodeResizer
        color="#3b82f6"
        isVisible={selected}
        minWidth={80}
        minHeight={40}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <EditableNode
        data={data}
        style={{
          padding: '12px 20px',
          borderRadius: '16px',
          background: data.color || 'white',
          border: `2px solid ${data.borderColor || '#cbd5e1'}`,
          minWidth: '120px',
          width: '100%',
          height: '100%',
          textAlign: 'center',
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 2px #3b82f6, 0 2px 8px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ fontWeight: 500, color: '#1e293b' }}>{data.label}</div>
      </EditableNode>
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
    </>
  );
}

// Custom Decision Node (Diamond)
function DecisionNode({ data, selected }: { data: any; selected?: boolean }) {
  // SVG diamond (not a CSS rotate) so the resizer, handles, and label all stay
  // axis-aligned. Handles sit at the diamond's four points (bbox edge midpoints).
  return (
    <div style={{ width: '100%', height: '100%', minWidth: 120, minHeight: 90, position: 'relative' }}>
      <NodeResizer
        color="#f59e0b"
        isVisible={selected}
        minWidth={120}
        minHeight={90}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle type="target" position={Position.Top} id="top" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left" style={HANDLE_STYLE} />
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: 'block' }}>
        <polygon
          points="50,2 98,50 50,98 2,50"
          fill={data.color || 'white'}
          stroke={selected ? '#3b82f6' : (data.borderColor || '#f59e0b')}
          strokeWidth="2"
        />
      </svg>
      <EditableNode
        data={data}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <div style={{
          fontWeight: 500,
          color: '#1e293b',
          padding: '0 24px',
          textAlign: 'center',
          fontSize: '14px',
        }}>
          {data.label}
        </div>
      </EditableNode>
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right" style={HANDLE_STYLE} />
    </div>
  );
}

// Custom Start Node (Rounded Rectangle)
function StartNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <>
      <NodeResizer
        color="#10b981"
        isVisible={selected}
        minWidth={80}
        minHeight={40}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <EditableNode
        data={data}
        style={{
          padding: '12px 24px',
          borderRadius: '24px',
          background: data.color || 'white',
          border: `2px solid ${data.borderColor || '#cbd5e1'}`,
          minWidth: '100px',
          width: '100%',
          height: '100%',
          textAlign: 'center',
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 2px #3b82f6, 0 2px 8px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontWeight: 500, color: '#1e293b' }}>{data.label}</div>
      </EditableNode>
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
    </>
  );
}

// Custom End Node (Rounded Rectangle - Red)
function EndNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <>
      <NodeResizer
        color="#ef4444"
        isVisible={selected}
        minWidth={80}
        minHeight={40}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <EditableNode
        data={data}
        style={{
          padding: '12px 24px',
          borderRadius: '24px',
          background: data.color || 'white',
          border: `2px solid ${data.borderColor || '#cbd5e1'}`,
          minWidth: '100px',
          width: '100%',
          height: '100%',
          textAlign: 'center',
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 2px #3b82f6, 0 2px 8px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontWeight: 500, color: '#1e293b' }}>{data.label}</div>
      </EditableNode>
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          background: '#94a3b8',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}
      />
    </>
  );
}

// Input/Output Node (Parallelogram)
function InputOutputNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <>
      <NodeResizer
        color="#8b5cf6"
        isVisible={selected}
        minWidth={80}
        minHeight={40}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle type="target" position={Position.Top} id="top" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left" style={HANDLE_STYLE} />
      <EditableNode
        data={data}
        style={{
          padding: '12px 20px',
          background: data.color || 'white',
          border: `2px solid ${data.borderColor || '#8b5cf6'}`,
          minWidth: '120px',
          width: '100%',
          height: '100%',
          textAlign: 'center',
          transform: 'skewX(-15deg)',
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 2px #3b82f6' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontWeight: 500, color: '#1e293b', transform: 'skewX(15deg)' }}>
          {data.label}
        </div>
      </EditableNode>
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right" style={HANDLE_STYLE} />
    </>
  );
}

// Database Node (Cylinder)
function DatabaseNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <>
      <NodeResizer
        color="#f97316"
        isVisible={selected}
        minWidth={80}
        minHeight={100}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle type="target" position={Position.Top} id="top" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left" style={HANDLE_STYLE} />
      <EditableNode
        data={data}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 2px #3b82f6' : 'none',
          borderRadius: '4px',
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 100 120" preserveAspectRatio="none">
          <ellipse
            cx="50"
            cy="15"
            rx="45"
            ry="15"
            fill={data.color || 'white'}
            stroke={data.borderColor || '#f97316'}
            strokeWidth="2"
          />
          <rect
            x="5"
            y="15"
            width="90"
            height="90"
            fill={data.color || 'white'}
            stroke="none"
          />
          <line
            x1="5"
            y1="15"
            x2="5"
            y2="105"
            stroke={data.borderColor || '#f97316'}
            strokeWidth="2"
          />
          <line
            x1="95"
            y1="15"
            x2="95"
            y2="105"
            stroke={data.borderColor || '#f97316'}
            strokeWidth="2"
          />
          <ellipse
            cx="50"
            cy="105"
            rx="45"
            ry="15"
            fill={data.color || 'white'}
            stroke={data.borderColor || '#f97316'}
            strokeWidth="2"
          />
          <text
            x="50"
            y="65"
            textAnchor="middle"
            fill="#1e293b"
            fontSize="14"
            fontWeight="500"
          >
            {data.label}
          </text>
        </svg>
      </EditableNode>
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right" style={HANDLE_STYLE} />
    </>
  );
}

// Cloud Node
function CloudNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <>
      <NodeResizer
        color="#0ea5e9"
        isVisible={selected}
        minWidth={100}
        minHeight={60}
        lineStyle={{ borderWidth: 2 }}
        handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
      />
      <Handle type="target" position={Position.Top} id="top" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left" style={HANDLE_STYLE} />
      <EditableNode
        data={data}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 2px #3b82f6' : 'none',
          borderRadius: '40px',
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 140 90" preserveAspectRatio="none">
          <path
            d="M 30,60 Q 30,40 50,40 Q 50,25 70,25 Q 90,25 95,35 Q 110,35 115,50 Q 115,65 100,65 L 40,65 Q 25,65 30,60 Z"
            fill={data.color || 'white'}
            stroke={data.borderColor || '#0ea5e9'}
            strokeWidth="2"
          />
          <text
            x="70"
            y="55"
            textAnchor="middle"
            fill="#1e293b"
            fontSize="14"
            fontWeight="500"
          >
            {data.label}
          </text>
        </svg>
      </EditableNode>
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right" style={HANDLE_STYLE} />
    </>
  );
}

// Connector/Join Node (Small Circle).
// Four handles, one per side, matching the other shapes' id scheme
// (top/left as targets, bottom/right as sources) so edges bind consistently.
const CONNECTOR_HANDLE_STYLE: React.CSSProperties = {
  ...HANDLE_STYLE,
  width: '8px',
  height: '8px',
};
function ConnectorNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div style={{ width: 24, height: 24, position: 'relative' }}>
      <Handle type="target" position={Position.Top} id="top" style={CONNECTOR_HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left" style={CONNECTOR_HANDLE_STYLE} />
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: data.color || '#1e293b',
          border: `2px solid ${selected ? '#3b82f6' : (data.borderColor || '#1e293b')}`,
          boxShadow: selected ? '0 0 0 2px #3b82f6' : 'none',
        }}
      />
      <Handle type="source" position={Position.Bottom} id="bottom" style={CONNECTOR_HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right" style={CONNECTOR_HANDLE_STYLE} />
    </div>
  );
}

export const FlowDiagramEditor: React.FC<FlowDiagramEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  projectPath = '',
  stepNumber
}) => {
  const [title, setTitle] = useState(initialData?.title || 'New Diagram');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTool, setSelectedTool] = useState<
    | 'select'
    | 'process'
    | 'start'
    | 'end'
    | 'document'
    | 'decision'
    | 'triangle'
    | 'hexagon'
    | 'octagon'
    | 'trapezoid'
    | 'inputOutput'
    | 'database'
    | 'cloud'
    | 'connector'
  >('select');
  const [edgeStyle, setEdgeStyle] = useState<'default' | 'straight' | 'step' | 'smoothstep'>('smoothstep');
  const [customEdgeType, setCustomEdgeType] = useState<'default' | 'button' | 'labeled' | 'animated'>('default');
  const [darkMode, setDarkMode] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [shapeSearch, setShapeSearch] = useState('');
  const [shapePanelOpen, setShapePanelOpen] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });

  // Initialize nodes and edges from initialData
  const initialNodes: Node[] = useMemo(() => {
    if (initialData?.elements && Array.isArray(initialData.elements)) {
      // Nodes don't have source/target properties
      return initialData.elements.filter((el: any) => !el.source && !el.target);
    }
    return [];
  }, [initialData]);


  const initialEdges: Edge[] = useMemo(() => {
    if (initialData?.elements && Array.isArray(initialData.elements)) {
      // Edges have source and target properties
      const edges = initialData.elements.filter((el: any) => el.source && el.target);
      // Remove invalid 'edge' type if present
      return edges.map((edge: any) => {
        if (edge.type === 'edge') {
          const { type, ...rest } = edge;
          return rest;
        }
        return edge;
      });
    }
    return [];
  }, [initialData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // onLabelChange is a function and is NOT serialized into the saved diagram JSON,
  // nor set on template-built nodes. Re-attach it to any node missing it so
  // double-click label editing works on every shape. Idempotent: once every node
  // has the handler, `needsAttach` is false and the effect no-ops (no loop).
  React.useEffect(() => {
    if (nodes.length === 0) return;
    const needsAttach = nodes.some((n) => typeof n.data?.onLabelChange !== 'function');
    if (!needsAttach) return;
    setNodes((nds) =>
      nds.map((node) =>
        typeof node.data?.onLabelChange === 'function'
          ? node
          : {
              ...node,
              data: {
                ...node.data,
                onLabelChange: (newLabel: string) => {
                  setNodes((cur) =>
                    cur.map((n) =>
                      n.id === node.id ? { ...n, data: { ...n.data, label: newLabel } } : n
                    )
                  );
                },
              },
            }
      )
    );
  }, [nodes, setNodes]);

  // Handle connections between nodes
  const onConnect = useCallback(
    (params: Connection) => {
      let edgeType = customEdgeType !== 'default' ? customEdgeType : (edgeStyle === 'default' ? undefined : edgeStyle);
      let edgeLabel: string | undefined;

      // Edges leaving a decision node default to a labeled branch (Yes / No)
      const sourceNode = nodes.find((n) => n.id === params.source);
      if (sourceNode?.type === 'decision') {
        edgeType = 'labeled';
        const existingBranches = edges.filter((e) => e.source === params.source).length;
        edgeLabel = existingBranches === 0 ? 'Yes' : existingBranches === 1 ? 'No' : '';
      }

      const newEdge = {
        ...params,
        type: edgeType,
        ...(edgeLabel !== undefined ? { data: { label: edgeLabel } } : {}),
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          strokeWidth: 2,
          stroke: darkMode ? '#94a3b8' : '#64748b',
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges, edges, nodes, edgeStyle, customEdgeType, darkMode]
  );

  // Add a new node when clicking on the canvas
  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (selectedTool === 'select') return;

      if (!reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeId = `node-${Date.now()}`;
      const newNode: Node = {
        id: nodeId,
        type: selectedTool,
        position,
        data: {
          label: DEFAULT_NODE_LABELS[selectedTool] ??
            `${selectedTool.charAt(0).toUpperCase() + selectedTool.slice(1)}`,
          onLabelChange: (newLabel: string) => {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === nodeId ? { ...node, data: { ...node.data, label: newLabel } } : node
              )
            );
          },
        },
      };

      // Shapes that need an explicit size to render correctly on first placement
      const size = DEFAULT_NODE_SIZE[selectedTool];
      if (size) {
        newNode.style = { width: size.width, height: size.height };
      }

      setNodes((nds) => [...nds, newNode]);
      setSelectedTool('select'); // Return to select mode after adding
    },
    [selectedTool, reactFlowInstance, setNodes]
  );

  // Alignment-on-drop: when a node is released, snap its edges into line with
  // nearby nodes within a threshold. Runs on drag *stop* (not during drag) so it
  // does not fight ReactFlow's internal drag handler.
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      const THRESHOLD = 6;
      const dw = draggedNode.width ?? 0;
      const dh = draggedNode.height ?? 0;
      const dragLeft = draggedNode.position.x;
      const dragTop = draggedNode.position.y;

      let snapX: number | null = null;
      let snapY: number | null = null;

      for (const other of nodes) {
        if (other.id === draggedNode.id) continue;
        const ow = other.width ?? 0;
        const oh = other.height ?? 0;
        const oLeft = other.position.x;
        const oTop = other.position.y;

        // Horizontal alignment candidates: left edge, center, right edge
        const xPairs: [number, number][] = [
          [dragLeft, oLeft],
          [dragLeft + dw / 2, oLeft + ow / 2],
          [dragLeft + dw, oLeft + ow],
        ];
        for (const [dragVal, otherVal] of xPairs) {
          if (snapX === null && Math.abs(dragVal - otherVal) <= THRESHOLD) {
            snapX = dragLeft + (otherVal - dragVal);
          }
        }

        // Vertical alignment candidates: top edge, middle, bottom edge
        const yPairs: [number, number][] = [
          [dragTop, oTop],
          [dragTop + dh / 2, oTop + oh / 2],
          [dragTop + dh, oTop + oh],
        ];
        for (const [dragVal, otherVal] of yPairs) {
          if (snapY === null && Math.abs(dragVal - otherVal) <= THRESHOLD) {
            snapY = dragTop + (otherVal - dragVal);
          }
        }
      }

      if (snapX !== null || snapY !== null) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === draggedNode.id
              ? {
                  ...n,
                  position: {
                    x: snapX ?? n.position.x,
                    y: snapY ?? n.position.y,
                  },
                }
              : n
          )
        );
      }
    },
    [nodes, setNodes]
  );

  // Delete selected nodes
  const deleteSelected = useCallback(() => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  }, [setNodes, setEdges]);

  // Duplicate selected nodes
  const duplicateSelected = useCallback(() => {
    const selectedNodes = nodes.filter((node) => node.selected);
    if (selectedNodes.length === 0) return;

    const newNodes = selectedNodes.map((node) => ({
      ...node,
      id: `node-${Date.now()}-${Math.random()}`,
      position: { x: node.position.x + 50, y: node.position.y + 50 },
      selected: false,
    }));

    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
  }, [nodes, setNodes]);

  // Copy selected nodes (and edges between them) to an in-memory clipboard
  const copySelected = useCallback(() => {
    const selectedNodes = nodes.filter((node) => node.selected);
    if (selectedNodes.length === 0) return;
    const selectedIds = new Set(selectedNodes.map((n) => n.id));
    const internalEdges = edges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
    );
    clipboardRef.current = {
      nodes: selectedNodes.map((n) => ({ ...n })),
      edges: internalEdges.map((e) => ({ ...e })),
    };
  }, [nodes, edges]);

  // Paste clipboard contents, offset slightly, with fresh ids
  const pasteClipboard = useCallback(() => {
    const { nodes: copiedNodes, edges: copiedEdges } = clipboardRef.current;
    if (copiedNodes.length === 0) return;

    const stamp = Date.now();
    const idMap = new Map<string, string>();
    const newNodes = copiedNodes.map((node, i) => {
      const newId = `node-${stamp}-${i}`;
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId,
        position: { x: node.position.x + 24, y: node.position.y + 24 },
        selected: true,
      };
    });
    const newEdges = copiedEdges.map((edge, i) => ({
      ...edge,
      id: `edge-${stamp}-${i}`,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
      selected: false,
    }));

    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);
  }, [setNodes, setEdges]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // Save to history
  const saveToHistory = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: [...nodes], edges: [...edges] });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [nodes, edges, history, historyIndex]);

  // Update node color
  const updateNodeColor = useCallback(
    (color: string) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.selected) {
            return {
              ...node,
              data: { ...node.data, color },
            };
          }
          return node;
        })
      );
      saveToHistory();
    },
    [setNodes, saveToHistory]
  );

  // Zoom controls
  const zoomIn = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.zoomIn();
    }
  }, [reactFlowInstance]);

  const zoomOut = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.zoomOut();
    }
  }, [reactFlowInstance]);

  const fitView = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2 });
    }
  }, [reactFlowInstance]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = event.target as HTMLElement;
      const isEditingText = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Delete - only if not editing text
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditingText) {
        event.preventDefault();
        deleteSelected();
      }
      // Duplicate
      if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
        event.preventDefault();
        duplicateSelected();
      }
      // Copy - only if not editing text
      if ((event.ctrlKey || event.metaKey) && event.key === 'c' && !isEditingText) {
        event.preventDefault();
        copySelected();
      }
      // Paste - only if not editing text
      if ((event.ctrlKey || event.metaKey) && event.key === 'v' && !isEditingText) {
        event.preventDefault();
        pasteClipboard();
      }
      // Undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      // Redo
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
        event.preventDefault();
        redo();
      }
      // Select all
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        event.preventDefault();
        setNodes((nds) => nds.map((node) => ({ ...node, selected: true })));
      }
      // Escape - deselect all or exit editing mode
      if (event.key === 'Escape') {
        setSelectedTool('select');
        setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
        setEdges((eds) => eds.map((edge) => ({ ...edge, selected: false })));
        // Blur any active input to exit editing mode
        if (isEditingText) {
          target.blur();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, deleteSelected, duplicateSelected, copySelected, pasteClipboard, undo, redo, setNodes, setEdges, setSelectedTool]);

  // Save to history when nodes or edges change
  React.useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      const timeoutId = setTimeout(() => {
        saveToHistory();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, edges]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!reactFlowInstance) return;

    setIsSaving(true);
    try {
      // Prepare diagram data - keep original edge types
      const allElements = [
        ...nodes,
        ...edges
      ];

      const diagramId = initialData?.id || `diagram-${Date.now()}`;

      // Export to PNG - Capture full canvas using fitView approach
      if (!reactFlowInstance || nodes.length === 0) return;

      // Save original viewport
      const originalViewport = reactFlowInstance.getViewport();

      // Fit view to show all nodes with padding
      reactFlowInstance.fitView({ padding: 0.2, duration: 0 });

      // Wait for fitView to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get the React Flow element
      const flowWrapper = reactFlowWrapper.current;
      if (!flowWrapper) {
        console.error('Could not find flow wrapper');
        reactFlowInstance.setViewport(originalViewport, { duration: 0 });
        return;
      }

      const reactFlowElement = flowWrapper.querySelector('.react-flow') as HTMLElement;
      if (!reactFlowElement) {
        console.error('Could not find React Flow element');
        reactFlowInstance.setViewport(originalViewport, { duration: 0 });
        return;
      }

      // Hide UI elements temporarily
      const elementsToHide = reactFlowElement.querySelectorAll(
        '.react-flow__controls, .react-flow__minimap, .react-flow__panel, .react-flow__attribution'
      );
      elementsToHide.forEach((el: any) => {
        el.style.visibility = 'hidden';
      });

      // Capture the screenshot - let toPng handle the dimensions
      const dataUrl = await toPng(reactFlowElement, {
        backgroundColor: darkMode ? '#1f2937' : '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
        filter: (node) => {
          // Additional filtering for UI elements
          if (node.classList) {
            return !node.classList.contains('react-flow__controls') &&
                   !node.classList.contains('react-flow__minimap') &&
                   !node.classList.contains('react-flow__panel') &&
                   !node.classList.contains('react-flow__attribution');
          }
          return true;
        },
      });

      // Restore UI elements visibility
      elementsToHide.forEach((el: any) => {
        el.style.visibility = '';
      });

      // Restore original viewport
      reactFlowInstance.setViewport(originalViewport, { duration: 0 });

      // Convert data URL to base64
      const base64Image = dataUrl.split(',')[1];

      // Create serializable app state
      const serializableAppState = {
        viewport: reactFlowInstance.getViewport(),
        zoom: reactFlowInstance.getViewport().zoom,
      };

      // Save via Electron IPC
      const result = await window.electronAPI?.saveDiagram({
        stepId: diagramId,
        title,
        projectName: projectPath,
        diagramJson: JSON.stringify({
          nodes,
          edges,
          viewport: serializableAppState.viewport,
          lastModified: Date.now() // Add timestamp to force refresh
        }),
        diagramImage: base64Image
      });

      if (result?.success) {
        onSave({
          id: diagramId,
          title,
          jsonPath: result.jsonPath,
          imagePath: result.imagePath,
          elements: allElements,
          appState: serializableAppState
        });
        onClose();
      } else {
        console.error('Failed to save diagram');
        alert('Failed to save diagram: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving diagram');
      alert('Error saving diagram. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [title, nodes, edges, reactFlowInstance, initialData?.id, projectPath, onSave, onClose]);

  // Load a starter template; confirm before overwriting a non-empty canvas
  const loadTemplate = useCallback(
    (template: DiagramTemplate) => {
      if (nodes.length > 0 || edges.length > 0) {
        const ok = window.confirm(
          `Replace the current diagram with the "${template.name}" template? You can undo this with Ctrl+Z.`
        );
        if (!ok) return;
      }
      const { nodes: tNodes, edges: tEdges } = template.build();
      setNodes(tNodes);
      setEdges(tEdges);
      setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2 }), 50);
    },
    [nodes.length, edges.length, setNodes, setEdges, reactFlowInstance]
  );

  // Run dependency-free layered auto-layout over the current graph
  const tidyLayout = useCallback(() => {
    if (nodes.length === 0) return;
    setNodes((nds) => layeredLayout(nds, edges));
    setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2 }), 50);
  }, [nodes.length, edges, setNodes, reactFlowInstance]);

  // Shapes filtered by the search box, grouped by category
  const filteredShapeGroups = useMemo(() => {
    const q = shapeSearch.trim().toLowerCase();
    const matches = q
      ? SHAPE_CATALOG.filter(
          (s) => s.label.toLowerCase().includes(q) || s.keywords.includes(q)
        )
      : SHAPE_CATALOG;
    const order: ShapeCategory[] = ['Flow', 'Shapes', 'Data', 'Annotation'];
    return order
      .map((cat) => ({ category: cat, shapes: matches.filter((s) => s.category === cat) }))
      .filter((g) => g.shapes.length > 0);
  }, [shapeSearch]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${darkMode ? 'bg-gray-900' : 'bg-white'} z-50 flex flex-col w-screen h-screen transition-colors`}>
      {/* Header */}
      <div className={`px-4 pt-12 pb-4 border-b ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'} shrink-0 transition-colors`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`text-lg font-semibold bg-transparent border-none outline-none ${darkMode ? 'text-white focus:bg-gray-800' : 'focus:bg-gray-50 text-gray-900'} px-2 py-1 rounded transition-colors`}
              placeholder="Diagram title..."
            />
          </div>
          <div className="flex items-center space-x-2">
            {/* Templates dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowTemplates((v) => !v)}
                className={`flex items-center space-x-2 px-3 py-2 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} rounded-lg hover:bg-opacity-80 transition-colors`}
                title="Insert a starter template"
              >
                <LayoutTemplate className="w-4 h-4" />
                <span className="text-sm">Templates</span>
              </button>
              {showTemplates && (
                <>
                  <div className="fixed inset-0 z-[90]" onClick={() => setShowTemplates(false)} />
                  <div className={`absolute right-0 mt-1 w-64 rounded-lg shadow-xl border z-[100] ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    {DIAGRAM_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => {
                          loadTemplate(tpl);
                          setShowTemplates(false);
                        }}
                        className={`w-full text-left px-3 py-2 transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                      >
                        <div className={`text-sm font-medium ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>{tpl.name}</div>
                        <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{tpl.description}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Tidy-up auto-layout */}
            <button
              onClick={tidyLayout}
              className={`flex items-center space-x-2 px-3 py-2 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} rounded-lg hover:bg-opacity-80 transition-colors`}
              title="Tidy up — auto-arrange the diagram"
            >
              <Wand2 className="w-4 h-4" />
            </button>
            {/* Snap-to-grid toggle */}
            <button
              onClick={() => setSnapEnabled((v) => !v)}
              className={`flex items-center space-x-2 px-3 py-2 ${snapEnabled ? 'bg-blue-600 text-white' : `${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'}`} rounded-lg hover:bg-opacity-80 transition-colors`}
              title={snapEnabled ? 'Snap to grid: on' : 'Snap to grid: off (edge-alignment guides active)'}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`flex items-center space-x-2 px-3 py-2 ${darkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-200 text-gray-700'} rounded-lg hover:bg-opacity-80 transition-colors`}
              title="Toggle Dark Mode"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
            <button
              onClick={onClose}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div className={`flex flex-1 overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-gray-100'} transition-colors`}>
        {/* Left Panel - Searchable Shape Library + Edge styles */}
        {shapePanelOpen ? (
          <div className={`w-56 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-r flex flex-col shrink-0 mt-4 mb-4 ml-4 rounded-lg transition-colors overflow-hidden`}>
            {/* Panel header */}
            <div className={`flex items-center justify-between px-3 py-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <span className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Shapes</span>
              <button
                onClick={() => setShapePanelOpen(false)}
                className={`p-1 rounded ${darkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                title="Collapse panel"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Select tool + search */}
            <div className="px-3 pt-2 pb-1 space-y-2">
              <button
                onClick={() => setSelectedTool('select')}
                className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded text-sm transition-colors ${
                  selectedTool === 'select'
                    ? 'bg-blue-100 text-blue-600'
                    : `${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`
                }`}
                title="Select & Move"
              >
                <Plus className="w-4 h-4 rotate-45" />
                <span>Select &amp; Move</span>
              </button>
              <div className="relative">
                <Search className={`w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <input
                  type="text"
                  value={shapeSearch}
                  onChange={(e) => setShapeSearch(e.target.value)}
                  placeholder="Search shapes..."
                  className={`w-full pl-8 pr-2 py-1.5 text-sm rounded border outline-none transition-colors ${
                    darkMode
                      ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-500 focus:border-blue-500'
                      : 'bg-white border-gray-300 text-gray-700 placeholder-gray-400 focus:border-blue-500'
                  }`}
                />
              </div>
            </div>

            {/* Shape catalog */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
              {filteredShapeGroups.length === 0 && (
                <div className={`text-xs text-center py-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  No shapes match &ldquo;{shapeSearch}&rdquo;
                </div>
              )}
              {filteredShapeGroups.map((group) => (
                <div key={group.category}>
                  <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {group.category}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {group.shapes.map((shape) => {
                      const ShapeIcon = shape.icon;
                      const active = selectedTool === shape.tool;
                      return (
                        <button
                          key={shape.tool}
                          onClick={() => setSelectedTool(shape.tool as typeof selectedTool)}
                          className={`flex flex-col items-center justify-center space-y-1 px-1 py-2 rounded text-[11px] transition-colors ${
                            active
                              ? 'bg-blue-100 text-blue-600 ring-1 ring-blue-400'
                              : `${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`
                          }`}
                          title={`Add ${shape.label}`}
                        >
                          <ShapeIcon className="w-4 h-4" />
                          <span className="leading-tight text-center">{shape.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Edge style controls */}
            <div className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} px-3 py-2 space-y-2`}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Connector
              </div>
              <div className="grid grid-cols-4 gap-1">
                {([
                  { style: 'default', icon: GitBranch, title: 'Bezier curve' },
                  { style: 'straight', icon: Minus, title: 'Straight line' },
                  { style: 'step', icon: ArrowRight, title: 'Step line' },
                  { style: 'smoothstep', icon: ArrowRight, title: 'Smooth step' },
                ] as const).map((e) => {
                  const EdgeIcon = e.icon;
                  return (
                    <button
                      key={e.style}
                      onClick={() => setEdgeStyle(e.style)}
                      className={`p-1.5 rounded flex items-center justify-center transition-colors ${
                        edgeStyle === e.style
                          ? 'bg-blue-100 text-blue-600'
                          : `${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`
                      }`}
                      title={e.title}
                    >
                      <EdgeIcon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {([
                  { type: 'default', icon: Minus, title: 'Plain edge' },
                  { type: 'button', icon: Circle, title: 'Edge with delete button' },
                  { type: 'labeled', icon: Type, title: 'Labeled edge' },
                  { type: 'animated', icon: Sparkles, title: 'Animated edge' },
                ] as const).map((e) => {
                  const EdgeIcon = e.icon;
                  return (
                    <button
                      key={e.type}
                      onClick={() => setCustomEdgeType(e.type)}
                      className={`p-1.5 rounded flex items-center justify-center transition-colors ${
                        customEdgeType === e.type
                          ? 'bg-blue-100 text-blue-600'
                          : `${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`
                      }`}
                      title={e.title}
                    >
                      <EdgeIcon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="shrink-0 mt-4 ml-4">
            <button
              onClick={() => setShapePanelOpen(true)}
              className={`p-2 rounded-lg ${darkMode ? 'bg-gray-900 text-gray-300 hover:bg-gray-800' : 'bg-gray-50 text-gray-600 hover:bg-gray-200'} transition-colors`}
              title="Open shape library"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* React Flow Canvas */}
        <div ref={reactFlowWrapper} className="flex-1 m-4">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onPaneClick={onPaneClick}
              onNodeDragStop={snapEnabled ? undefined : onNodeDragStop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              snapToGrid={snapEnabled}
              snapGrid={[16, 16]}
              selectionOnDrag={selectedTool === 'select'}
              panOnDrag={[1, 2]}
              multiSelectionKeyCode="Shift"
              deleteKeyCode={null}
              className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm border ${darkMode ? 'border-gray-700' : 'border-gray-200'} transition-all`}
              style={{ height: '100%', width: '100%' }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={16}
                size={1}
                color={darkMode ? '#4b5563' : '#d1d5db'}
              />
              <Controls className={darkMode ? 'bg-gray-800 border-gray-700' : ''} />
              <MiniMap
                nodeStrokeWidth={3}
                zoomable
                pannable
                className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'} transition-colors`}
                maskColor={darkMode ? 'rgba(17, 24, 39, 0.7)' : 'rgba(0, 0, 0, 0.1)'}
              />
              <Panel position="top-right" className={`${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'} p-2 rounded-lg shadow-md border m-2 transition-colors`}>
                <div className="text-xs flex items-center space-x-2">
                  <span>{selectedTool === 'select' ? 'Select and drag nodes' : `Click to add ${selectedTool}`}</span>
                </div>
              </Panel>
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {/* Right Toolbar - Actions */}
        <div className={`w-16 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-l flex flex-col items-center py-2 overflow-y-auto shrink-0 mt-4 mb-4 mr-4 rounded-lg transition-colors space-y-1`}>
          <div className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'} font-semibold mb-2 px-1 text-center`}>Actions</div>

          <button
            onClick={duplicateSelected}
            className={`p-2 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'} text-gray-600 transition-colors`}
            title="Duplicate (Ctrl+D)"
          >
            <Copy className="w-4 h-4" />
          </button>

          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className={`p-2 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'} text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className={`p-2 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'} text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            onClick={deleteSelected}
            className={`p-2 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-red-100'} text-red-600 transition-colors`}
            title="Delete Selected (Del)"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="h-px w-full bg-gray-300 my-2" />

          <button
            onClick={zoomIn}
            className={`p-2 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'} text-gray-600 transition-colors`}
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            onClick={zoomOut}
            className={`p-2 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'} text-gray-600 transition-colors`}
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            onClick={fitView}
            className={`p-2 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'} text-gray-600 transition-colors`}
            title="Fit to Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <div className="h-px w-full bg-gray-300 my-2" />

          <div className="relative px-1 w-full">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className={`p-2 rounded ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'} text-gray-600 transition-colors w-full`}
              title="Change Color"
            >
              <Palette className="w-4 h-4 mx-auto" />
            </button>
            {showColorPicker && (
              <div className="fixed bg-white border border-gray-300 rounded-lg shadow-xl p-3 z-[100]" style={{
                right: '80px',
                bottom: '20px',
                maxHeight: 'calc(100vh - 120px)',
                overflowY: 'auto'
              }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700">Node Colors</span>
                  <button
                    onClick={() => setShowColorPicker(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {['#ffffffff', '#f3f4f6', '#fef3c7', '#fecaca', '#f52d44ff', '#9aa3f7ff', '#e9d5ff', '#ddd6fe', '#c7d2fe', '#bfdbfe', '#bae6fd', '#a5f3fc', '#99f6e4', '#bbf7d0', '#d9f99d', '#fced7aff'].map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        updateNodeColor(color);
                        setSelectedColor(color);
                        setShowColorPicker(false);
                      }}
                      className="w-8 h-8 rounded border-2 border-gray-300 hover:scale-110 transition-transform hover:border-blue-500"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowDiagramEditor;
