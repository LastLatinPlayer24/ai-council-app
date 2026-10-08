import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { Agent, Message } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  agent: Agent;
  messageCount: number;
  influence: number; // 0-1, derived from messages sent + received
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;       // number of interactions
  sentiment: 'agree' | 'disagree' | 'neutral';
  animated: boolean;    // currently transmitting
  lastActive: number;   // timestamp
}

interface GraphStats {
  mostInfluential: string;
  mostContested: string;
  consensusCluster: string[];
  conflictPairs: [string, string][];
}

interface AgentGraphProps {
  agents: Agent[];
  messages: Message[];
  currentRound: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLinks(messages: Message[], agents: Agent[]): GraphLink[] {
  const linkMap = new Map<string, GraphLink>();

  // Build interaction map: when agent B posts after agent A, it creates a link A→B
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];

    if (
      prev.agentId === 'system' || curr.agentId === 'system' ||
      prev.agentId === 'user'   || curr.agentId === 'user'
    ) continue;
    if (prev.agentId === curr.agentId) continue;

    const key = `${prev.agentId}→${curr.agentId}`;
    const existing = linkMap.get(key);

    // Determine sentiment from decisions
    const sentiment: 'agree' | 'disagree' | 'neutral' = 'neutral';

    if (existing) {
      existing.weight += 1;
      existing.animated = Date.now() - existing.lastActive < 10000;
      existing.lastActive = Date.now();
    } else {
      linkMap.set(key, {
        source: prev.agentId,
        target: curr.agentId,
        weight: 1,
        sentiment,
        animated: i === messages.length - 1,
        lastActive: Date.now(),
      });
    }
  }

  // Add sentiment from decisions
  for (const [key, link] of linkMap.entries()) {
    const [srcId, tgtId] = key.split('→');
    // Check agreement patterns in decisions
    // Count how often both agents voted the same way
    const agrees = 0, disagrees = 0;
    // (simplified for demo - in production this would be richer)
    const srcAgent = agents.find(a => a.id === srcId);
    const tgtAgent = agents.find(a => a.id === tgtId);
    if (srcAgent && tgtAgent) {
      const scoreDiff = Math.abs(srcAgent.agreementScore - tgtAgent.agreementScore);
      if (scoreDiff < 15) link.sentiment = 'agree';
      else if (scoreDiff > 35) link.sentiment = 'disagree';
    }
    void agrees; void disagrees;
  }

  return Array.from(linkMap.values());
}

function computeStats(_nodes: GraphNode[], links: GraphLink[]): GraphStats {
  // Most influential = highest combined weight of all links
  const influence = new Map<string, number>();
  links.forEach(l => {
    const src = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
    const tgt = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
    influence.set(src, (influence.get(src) || 0) + l.weight);
    influence.set(tgt, (influence.get(tgt) || 0) + l.weight);
  });
  const mostInfluential = [...influence.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  // Most contested = link with highest weight + disagree
  const contested = links
    .filter(l => l.sentiment === 'disagree')
    .sort((a, b) => b.weight - a.weight)[0];
  const mostContested = contested
    ? `${typeof contested.source === 'string' ? contested.source : (contested.source as GraphNode).id} ↔ ${typeof contested.target === 'string' ? contested.target : (contested.target as GraphNode).id}`
    : '';

  // Consensus cluster = nodes connected only by agree links
  const agreeNodes = new Set<string>();
  links.filter(l => l.sentiment === 'agree').forEach(l => {
    agreeNodes.add(typeof l.source === 'string' ? l.source : (l.source as GraphNode).id);
    agreeNodes.add(typeof l.target === 'string' ? l.target : (l.target as GraphNode).id);
  });

  // Conflict pairs
  const conflictPairs: [string, string][] = links
    .filter(l => l.sentiment === 'disagree')
    .map(l => [
      typeof l.source === 'string' ? l.source : (l.source as GraphNode).id,
      typeof l.target === 'string' ? l.target : (l.target as GraphNode).id,
    ]);

  return {
    mostInfluential,
    mostContested,
    consensusCluster: [...agreeNodes],
    conflictPairs,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AgentGraph({ agents, messages, currentRound }: AgentGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 });
  const [pulsingNodes, setPulsingNodes] = useState<Set<string>>(new Set());

  // Track last message to pulse the sender. Keyed on the message's own id
  // (not the `messages` array reference) so a streaming content update on
  // the same last message doesn't restart the pulse animation.
  const lastMsg = messages[messages.length - 1];
  const lastMsgId = lastMsg?.id;
  const lastMsgAgentId = lastMsg?.agentId;
  useEffect(() => {
    if (!lastMsgId || lastMsgAgentId === 'system' || lastMsgAgentId === 'user') return;
    const addTimeout = setTimeout(() => {
      setPulsingNodes(prev => new Set([...prev, lastMsgAgentId]));
    }, 0);
    const removeTimeout = setTimeout(() => {
      setPulsingNodes(prev => {
        const next = new Set(prev);
        next.delete(lastMsgAgentId);
        return next;
      });
    }, 2000);
    return () => {
      clearTimeout(addTimeout);
      clearTimeout(removeTimeout);
    };
  }, [lastMsgId, lastMsgAgentId]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: Math.max(width, 300), height: Math.max(height, 300) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build & render graph
  const renderGraph = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || agents.length === 0) return;

    const { width, height } = dimensions;

    // Build data
    const nodes: GraphNode[] = agents.map(a => ({
      id: a.id,
      agent: a,
      messageCount: a.messageCount,
      influence: Math.min(a.messageCount / 35, 1),
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
    }));

    const links = buildLinks(messages, agents);
    const graphStats = computeStats(nodes, links);
    setStats(graphStats);

    // Clear previous
    d3.select(svg).selectAll('*').remove();

    const svgEl = d3.select(svg)
      .attr('width', width)
      .attr('height', height);

    // ── Defs: gradients, filters, markers ──────────────────────────────────
    const defs = svgEl.append('defs');

    // Glow filter
    const glowFilter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Strong glow
    const strongGlow = defs.append('filter')
      .attr('id', 'strong-glow')
      .attr('x', '-100%').attr('y', '-100%')
      .attr('width', '300%').attr('height', '300%');
    strongGlow.append('feGaussianBlur')
      .attr('stdDeviation', '6')
      .attr('result', 'coloredBlur');
    const feMerge2 = strongGlow.append('feMerge');
    feMerge2.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge2.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arrow markers per sentiment
    const arrowColors = {
      agree: '#00ff9d',
      disagree: '#f87171',
      neutral: '#00f5ff',
    };
    (['agree', 'disagree', 'neutral'] as const).forEach(sentiment => {
      defs.append('marker')
        .attr('id', `arrow-${sentiment}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', arrowColors[sentiment])
        .attr('opacity', 0.7);
    });

    // Radial gradients per agent
    nodes.forEach(node => {
      const grad = defs.append('radialGradient')
        .attr('id', `grad-${node.id}`)
        .attr('cx', '50%').attr('cy', '40%').attr('r', '60%');
      grad.append('stop').attr('offset', '0%')
        .attr('stop-color', node.agent.color)
        .attr('stop-opacity', 0.5);
      grad.append('stop').attr('offset', '100%')
        .attr('stop-color', node.agent.color)
        .attr('stop-opacity', 0.08);
    });

    // ── Background grid ─────────────────────────────────────────────────────
    const bgGroup = svgEl.append('g').attr('class', 'background');
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      bgGroup.append('line')
        .attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', height)
        .attr('stroke', 'rgba(0,245,255,0.03)').attr('stroke-width', 1);
    }
    for (let y = 0; y < height; y += gridSize) {
      bgGroup.append('line')
        .attr('x1', 0).attr('y1', y).attr('x2', width).attr('y2', y)
        .attr('stroke', 'rgba(0,245,255,0.03)').attr('stroke-width', 1);
    }

    // ── Simulation ───────────────────────────────────────────────────────────
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(d => 140 - (d as GraphLink).weight * 8)
        .strength(0.4)
      )
      .force('charge', d3.forceManyBody().strength(-320))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius(d => 30 + d.influence * 15))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05));

    simulationRef.current = simulation;

    // ── Links ────────────────────────────────────────────────────────────────
    const linkGroup = svgEl.append('g').attr('class', 'links');

    const linkEl = linkGroup.selectAll<SVGPathElement, GraphLink>('path')
      .data(links)
      .join('path')
      .attr('stroke', d => arrowColors[d.sentiment])
      .attr('stroke-width', d => Math.max(0.5, Math.min(d.weight * 0.8, 4)))
      .attr('stroke-opacity', d => d.animated ? 0.9 : 0.25)
      .attr('fill', 'none')
      .attr('marker-end', d => `url(#arrow-${d.sentiment})`)
      .attr('filter', d => d.animated ? 'url(#glow)' : 'none')
      .style('cursor', 'pointer')
      .on('mouseenter', function(_event, d) {
        d3.select(this)
          .attr('stroke-opacity', 1)
          .attr('stroke-width', d.weight * 1.2 + 1);
        setHoveredLink(d);
      })
      .on('mouseleave', function(_, d) {
        d3.select(this)
          .attr('stroke-opacity', d.animated ? 0.9 : 0.25)
          .attr('stroke-width', Math.max(0.5, Math.min(d.weight * 0.8, 4)));
        setHoveredLink(null);
      });

    // Animated pulse on active links
    linkEl.filter(d => d.animated)
      .each(function() {
        const el = d3.select(this);
        function pulse() {
          el.transition().duration(800)
            .attr('stroke-opacity', 0.4)
            .transition().duration(800)
            .attr('stroke-opacity', 1)
            .on('end', pulse);
        }
        pulse();
      });

    // ── Data particles on links (animated dots) ──────────────────────────────
    const particleGroup = svgEl.append('g').attr('class', 'particles');

    // ── Nodes ────────────────────────────────────────────────────────────────
    const nodeGroup = svgEl.append('g').attr('class', 'nodes');

    const nodeEl = nodeGroup.selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x; d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      )
      .on('click', (_, d) => {
        setSelectedNode(prev => prev?.id === d.id ? null : d);
      });

    // Outer ring (orbit)
    nodeEl.append('circle')
      .attr('r', d => 28 + d.influence * 14)
      .attr('fill', 'none')
      .attr('stroke', d => d.agent.color)
      .attr('stroke-width', 0.5)
      .attr('stroke-opacity', 0.2)
      .attr('stroke-dasharray', '4 3');

    // Pulse ring for active/thinking
    nodeEl.filter(d => d.agent.status === 'active' || d.agent.status === 'thinking')
      .append('circle')
      .attr('r', d => 24 + d.influence * 12)
      .attr('fill', 'none')
      .attr('stroke', d => d.agent.status === 'thinking' ? '#60a5fa' : d.agent.color)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.4)
      .each(function(d) {
        const el = d3.select(this);
        const baseR = 24 + d.influence * 12;
        function pulse() {
          el.attr('r', baseR)
            .transition().duration(d.agent.status === 'thinking' ? 600 : 1500)
            .attr('r', baseR + 8)
            .attr('stroke-opacity', 0)
            .transition().duration(0)
            .attr('stroke-opacity', 0.4)
            .on('end', pulse);
        }
        pulse();
      });

    // Hexagon background
    nodeEl.append('polygon')
      .attr('points', d => {
        const r = 20 + d.influence * 10;
        return Array.from({ length: 6 }, (_, i) => {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          return `${r * Math.cos(angle)},${r * Math.sin(angle)}`;
        }).join(' ');
      })
      .attr('fill', d => `url(#grad-${d.id})`)
      .attr('stroke', d => d.agent.color)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.7)
      .attr('filter', 'url(#glow)');

    // Inner hexagon
    nodeEl.append('polygon')
      .attr('points', d => {
        const r = 10 + d.influence * 4;
        return Array.from({ length: 6 }, (_, i) => {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          return `${r * Math.cos(angle)},${r * Math.sin(angle)}`;
        }).join(' ');
      })
      .attr('fill', d => d.agent.color)
      .attr('opacity', 0.15);

    // Avatar emoji
    nodeEl.append('text')
      .text(d => d.agent.avatar)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', d => 14 + d.influence * 6)
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Status dot
    nodeEl.append('circle')
      .attr('cx', d => 18 + d.influence * 9)
      .attr('cy', d => -(18 + d.influence * 9))
      .attr('r', 4)
      .attr('fill', d => {
        const c = { active: '#00ff9d', idle: '#fbbf24', thinking: '#60a5fa', offline: '#4b5563', error: '#f87171' };
        return c[d.agent.status];
      })
      .attr('stroke', '#070d14')
      .attr('stroke-width', 1.5);

    // Agent name label
    nodeEl.append('text')
      .text(d => d.agent.name)
      .attr('text-anchor', 'middle')
      .attr('dy', d => 36 + d.influence * 16)
      .attr('font-size', 9)
      .attr('font-family', 'Orbitron, sans-serif')
      .attr('font-weight', '700')
      .attr('letter-spacing', '0.1em')
      .attr('fill', d => d.agent.color)
      .attr('opacity', 0.9)
      .style('pointer-events', 'none');

    // Message count badge
    nodeEl.append('text')
      .text(d => `${d.messageCount}`)
      .attr('text-anchor', 'middle')
      .attr('dy', d => 47 + d.influence * 16)
      .attr('font-size', 7)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', 'rgba(255,255,255,0.3)')
      .style('pointer-events', 'none');

    // ── Particle animation on active links ───────────────────────────────────
    function animateParticles() {
      const activeLinks = links.filter(l => {
        const lastActive = l.lastActive || 0;
        return Date.now() - lastActive < 15000;
      });

      particleGroup.selectAll('*').remove();

      activeLinks.slice(0, 6).forEach(link => {
        const srcNode = typeof link.source === 'object' ? link.source as GraphNode : null;
        const tgtNode = typeof link.target === 'object' ? link.target as GraphNode : null;
        if (!srcNode || !tgtNode) return;

        const particle = particleGroup.append('circle')
          .attr('r', 2.5)
          .attr('fill', arrowColors[link.sentiment])
          .attr('opacity', 0.8)
          .attr('filter', 'url(#glow)');

        const duration = 1200 + Math.random() * 800;
        particle.transition()
          .duration(duration)
          .attrTween('cx', () => t => {
            const sx = srcNode.x ?? 0, tx = tgtNode.x ?? 0;
            return String(sx + (tx - sx) * t);
          })
          .attrTween('cy', () => t => {
            const sy = srcNode.y ?? 0, ty = tgtNode.y ?? 0;
            return String(sy + (ty - sy) * t + Math.sin(t * Math.PI) * 15);
          })
          .attr('opacity', 0)
          .remove();
      });
    }

    const particleInterval = setInterval(animateParticles, 1500);

    // ── Tick ─────────────────────────────────────────────────────────────────
    simulation.on('tick', () => {
      // Update curved link paths
      linkEl.attr('d', d => {
        const src = d.source as GraphNode;
        const tgt = d.target as GraphNode;
        const sx = src.x ?? 0, sy = src.y ?? 0;
        const tx = tgt.x ?? 0, ty = tgt.y ?? 0;
        const dx = tx - sx, dy = ty - sy;
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.2;
        return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`;
      });

      // Update node positions
      nodeEl.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // ── Zoom & pan ───────────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', event => {
        linkGroup.attr('transform', event.transform);
        nodeGroup.attr('transform', event.transform);
        particleGroup.attr('transform', event.transform);
      });

    svgEl.call(zoom);

    return () => {
      simulation.stop();
      clearInterval(particleInterval);
    };
  }, [agents, messages, dimensions]);

  useEffect(() => {
    const cleanup = renderGraph();
    return cleanup;
  }, [renderGraph]);

  // Highlight pulsing nodes
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGGElement, GraphNode>('.node')
      .select('polygon:first-of-type')
      .attr('filter', d => pulsingNodes.has(d.id) ? 'url(#strong-glow)' : 'url(#glow)');
  }, [pulsingNodes]);

  const selectedAgent = selectedNode?.agent;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-cyan-500/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-status-blink" />
          <span className="font-orbitron text-sm font-bold text-cyan-400 tracking-wider">
            COMMUNICATION GRAPH
          </span>
          <span className="text-xs text-gray-600 font-mono-jetbrains">
            Round {currentRound} · {messages.filter(m => m.agentId !== 'system' && m.agentId !== 'user').length} agent messages
          </span>
        </div>
        <div className="flex gap-3 text-xs font-mono-jetbrains">
          {[
            { color: '#00ff9d', label: 'AGREEMENT' },
            { color: '#f87171', label: 'CONFLICT' },
            { color: '#00f5ff', label: 'NEUTRAL' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-6 h-px" style={{ background: l.color }} />
              <span className="text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ background: 'transparent' }}
          />

          {/* Hover tooltip for links */}
          {hoveredLink && (
            <div className="absolute top-4 left-4 glass-panel px-3 py-2 text-xs font-mono-jetbrains pointer-events-none">
              <div className="text-gray-400 mb-1">INTERACTION</div>
              <div className="flex items-center gap-2">
                <span style={{ color: (hoveredLink.source as GraphNode).agent?.color }}>
                  {(hoveredLink.source as GraphNode).agent?.name}
                </span>
                <span className="text-gray-600">→</span>
                <span style={{ color: (hoveredLink.target as GraphNode).agent?.color }}>
                  {(hoveredLink.target as GraphNode).agent?.name}
                </span>
              </div>
              <div className="mt-1 flex gap-3">
                <span className="text-gray-500">{hoveredLink.weight}x interactions</span>
                <span style={{
                  color: hoveredLink.sentiment === 'agree' ? '#00ff9d'
                    : hoveredLink.sentiment === 'disagree' ? '#f87171' : '#00f5ff'
                }}>
                  {hoveredLink.sentiment.toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {/* Zoom hint */}
          <div className="absolute bottom-3 right-3 text-xs text-gray-700 font-mono-jetbrains">
            SCROLL TO ZOOM · DRAG TO PAN · CLICK NODE TO INSPECT
          </div>
        </div>

        {/* Right panel */}
        <div className="w-56 border-l border-cyan-500/10 flex flex-col overflow-y-auto">
          {/* Selected node inspector */}
          {selectedAgent ? (
            <div className="p-4 border-b border-cyan-500/10">
              <div className="text-xs font-orbitron text-gray-500 tracking-widest mb-3">NODE INSPECTOR</div>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center text-xl"
                  style={{ background: selectedAgent.color + '15', border: `1px solid ${selectedAgent.color}44` }}
                >
                  {selectedAgent.avatar}
                </div>
                <div>
                  <div className="font-orbitron text-sm font-bold" style={{ color: selectedAgent.color }}>
                    {selectedAgent.name}
                  </div>
                  <div className="text-xs text-gray-500 font-mono-jetbrains">{selectedAgent.role}</div>
                </div>
              </div>
              <div className="space-y-2 text-xs font-mono-jetbrains">
                {[
                  { label: 'STATUS', value: selectedAgent.status.toUpperCase(), color: selectedAgent.status === 'active' ? '#00ff9d' : selectedAgent.status === 'thinking' ? '#60a5fa' : '#fbbf24' },
                  { label: 'MESSAGES', value: String(selectedAgent.messageCount), color: '#e2e8f0' },
                  { label: 'AGREEMENT', value: `${selectedAgent.agreementScore}%`, color: selectedAgent.agreementScore > 70 ? '#00ff9d' : selectedAgent.agreementScore > 50 ? '#fbbf24' : '#f87171' },
                  { label: 'LATENCY', value: `${selectedAgent.latency}ms`, color: '#e2e8f0' },
                  { label: 'TOKENS', value: `${(selectedAgent.tokens / 1000).toFixed(1)}k`, color: '#a855f7' },
                  { label: 'MODE', value: selectedAgent.mode.replace('_', ' ').toUpperCase(), color: '#00f5ff' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className="text-gray-600">{row.label}</span>
                    <span style={{ color: row.color }}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-white/5">
                <div className="text-xs text-gray-600 font-mono-jetbrains mb-2">EXPERTISE</div>
                <div className="flex flex-wrap gap-1">
                  {selectedAgent.expertise.map(tag => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 text-xs rounded font-mono-jetbrains"
                      style={{ background: selectedAgent.color + '15', color: selectedAgent.color + 'aa' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 border-b border-cyan-500/10">
              <div className="text-xs font-orbitron text-gray-600 tracking-widest text-center py-4">
                CLICK A NODE TO INSPECT
              </div>
            </div>
          )}

          {/* Graph stats */}
          {stats && (
            <div className="p-4 space-y-4">
              <div className="text-xs font-orbitron text-gray-500 tracking-widest">GRAPH ANALYSIS</div>

              {stats.mostInfluential && (
                <div>
                  <div className="text-xs text-gray-600 font-mono-jetbrains mb-1">MOST INFLUENTIAL</div>
                  <div className="text-xs text-cyan-400 font-orbitron font-bold">
                    {agents.find(a => a.id === stats.mostInfluential)?.name || stats.mostInfluential}
                  </div>
                </div>
              )}

              {stats.consensusCluster.length > 0 && (
                <div>
                  <div className="text-xs text-gray-600 font-mono-jetbrains mb-1">CONSENSUS CLUSTER</div>
                  <div className="flex flex-wrap gap-1">
                    {stats.consensusCluster.map(id => {
                      const a = agents.find(ag => ag.id === id);
                      return a ? (
                        <span
                          key={id}
                          className="text-xs font-mono-jetbrains px-1.5 py-0.5 rounded"
                          style={{ color: a.color, background: a.color + '15' }}
                        >
                          {a.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {stats.conflictPairs.length > 0 && (
                <div>
                  <div className="text-xs text-gray-600 font-mono-jetbrains mb-1">CONFLICT PAIRS</div>
                  {stats.conflictPairs.slice(0, 3).map(([a, b], i) => {
                    const agA = agents.find(ag => ag.id === a);
                    const agB = agents.find(ag => ag.id === b);
                    return (
                      <div key={i} className="flex items-center gap-1 text-xs font-mono-jetbrains mb-1">
                        <span style={{ color: agA?.color }}>{agA?.name}</span>
                        <span className="text-red-400/60">⚡</span>
                        <span style={{ color: agB?.color }}>{agB?.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Agent activity feed */}
              <div>
                <div className="text-xs text-gray-600 font-mono-jetbrains mb-2">AGENT ACTIVITY</div>
                <div className="space-y-1.5">
                  {agents.map(agent => (
                    <div key={agent.id} className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: agent.status === 'active' ? '#00ff9d' : agent.status === 'thinking' ? '#60a5fa' : '#fbbf24' }}
                      />
                      <span
                        className="text-xs font-mono-jetbrains flex-1 truncate"
                        style={{ color: agent.color + 'cc' }}
                      >
                        {agent.name}
                      </span>
                      <span className="text-xs text-gray-700 font-mono-jetbrains">{agent.messageCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
