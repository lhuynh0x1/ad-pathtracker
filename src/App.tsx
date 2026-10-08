import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "./components/Canvas";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { EdgeSidebar } from "./components/EdgeSidebar";
import { ChatPanel } from "./components/ChatPanel";

function App() {
  return (
    <ReactFlowProvider>
      <div className="flex h-screen w-screen flex-col">
        <Toolbar />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1">
            <Canvas />
          </div>
          <Sidebar />
          <EdgeSidebar />
        </div>
      </div>
      <ChatPanel />
    </ReactFlowProvider>
  );
}

export default App;
