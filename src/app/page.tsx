

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-8">地图应用</h1>
        
        <div className="space-y-4">
          <a 
            href="/metro" 
            className="block w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-6 rounded-lg text-center transition-colors"
          >
            上海地铁系统
          </a>
          
          <a 
            href="/animate" 
            className="block w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-6 rounded-lg text-center transition-colors"
          >
            城市间动画
          </a>
        </div>
        
        <div className="mt-8 text-sm text-gray-600 text-center">
          <p>基于 Next.js + deck.gl + Mapbox 构建</p>
        </div>
      </div>
    </div>
  );
}
