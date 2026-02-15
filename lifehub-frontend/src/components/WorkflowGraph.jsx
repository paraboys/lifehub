import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function layoutStates(states) {
  const radius = 220;
  const centerX = 320;
  const centerY = 240;
  const total = states.length || 1;

  return states.map((state, index) => {
    const angle = (index / total) * Math.PI * 2;
    return {
      ...state,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  });
}

function edgeLabel(edge) {
  return edge.trigger_event || "AUTO";
}

export default function WorkflowGraph({ workflowId, authToken }) {
  const [graph, setGraph] = useState({ states: [], transitions: [] });
  const [status, setStatus] = useState("idle");
  const [selectedStateId, setSelectedStateId] = useState(null);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!workflowId) return;

    const load = async () => {
      setStatus("loading");
      setErrorText("");
      try {
        const headers = {};
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`;
        }

        const res = await fetch(`${API_URL}/workflows/${workflowId}/graph`, {
          headers
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message = body.error || `Failed to load workflow ${workflowId}`;
          throw new Error(message);
        }
        const data = await res.json();
        setGraph({
          states: data.states || [],
          transitions: data.transitions || []
        });
        const firstState = data.states?.[0];
        setSelectedStateId(firstState ? String(firstState.id) : null);
        setStatus("ready");
      } catch (err) {
        setErrorText(err.message);
        setStatus("error");
      }
    };

    load();
  }, [workflowId, authToken]);

  const nodes = useMemo(() => layoutStates(graph.states), [graph.states]);
  const nodeMap = useMemo(
    () => new Map(nodes.map(node => [String(node.id), node])),
    [nodes]
  );
  const selectedNode = selectedStateId ? nodeMap.get(selectedStateId) : null;
  const selectedOutgoing = useMemo(
    () => graph.transitions.filter(t => String(t.from_state) === selectedStateId),
    [graph.transitions, selectedStateId]
  );

  if (status === "loading") {
    return <div className="panel">Loading workflow graph...</div>;
  }

  if (status === "error") {
    return (
      <div className="panel error">
        Unable to load workflow graph. {errorText || "Check API and auth."}
      </div>
    );
  }

  if (!nodes.length) {
    return <div className="panel">No workflow data available.</div>;
  }

  return (
    <div className="graph-wrapper">
      <svg viewBox="0 0 640 480" className="graph-canvas">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2a2f3a" />
          </marker>
        </defs>

        {graph.transitions.map(edge => {
          const from = nodeMap.get(String(edge.from_state));
          const to = nodeMap.get(String(edge.to_state));
          if (!from || !to) return null;

          return (
            <line
              key={edge.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="edge"
              markerEnd="url(#arrow)"
            />
          );
        })}

        {nodes.map(node => {
          const active = String(node.id) === selectedStateId;
          return (
            <g
              key={node.id}
              className={`node-group ${active ? "is-active" : ""}`}
              onClick={() => setSelectedStateId(String(node.id))}
            >
            <circle
              cx={node.x}
              cy={node.y}
              r="30"
              className="node"
            />
            <text x={node.x} y={node.y} className="node-label">
              {node.state_name || node.name || `State ${node.id}`}
            </text>
            </g>
          );
        })}
      </svg>

      <div className="legend card">
        <div className="legend-title">State Inspector</div>
        {selectedNode ? (
          <>
            <div className="legend-row"><strong>ID:</strong> {String(selectedNode.id)}</div>
            <div className="legend-row"><strong>Name:</strong> {selectedNode.state_name || "Unnamed"}</div>
            <div className="legend-row"><strong>Type:</strong> {selectedNode.type || "NORMAL"}</div>
            <div className="legend-row"><strong>Final:</strong> {selectedNode.is_final ? "Yes" : "No"}</div>
          </>
        ) : (
          <div className="legend-row">Select a state to inspect details.</div>
        )}

        <div className="legend-title second">Outgoing Transitions</div>
        {!selectedOutgoing.length && (
          <div className="legend-row">No outgoing transition.</div>
        )}
        {selectedOutgoing.map(edge => (
          <div key={`edge-${edge.id}`} className="legend-row edge-row">
            <span>{String(edge.from_state)} -&gt; {String(edge.to_state)}</span>
            <code>{edgeLabel(edge)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
