import GeminiRotatorDashboard from '@/components/GeminiRotatorDashboard'
import InterviewDataViewer from '@/components/InterviewDataViewer'

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Assignment Ninjas - Admin Dashboard
        </h1>
        
        <div className="space-y-8">
          <GeminiRotatorDashboard />
          
          <InterviewDataViewer />
          
          {/* You can add more admin components here */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">System Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Environment:</strong> {process.env.NODE_ENV}
              </div>
              <div>
                <strong>Next.js:</strong> 15.5.3
              </div>
              <div>
                <strong>API Rotation:</strong> Enabled
              </div>
              <div>
                <strong>Blacklist Duration:</strong> 24 hours
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}