import { useState } from 'react'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { App, Button, Form, Input } from 'antd'
import { useAuth } from '../../contexts/AuthContext'

type LoginFormValues = {
  username: string
  password: string
}

export function LoginPage() {
  const { message } = App.useApp()
  const { login } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<LoginFormValues>()

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await login(values.username, values.password)
      message.success('登录成功')
    } catch (error) {
      if (error instanceof Error && error.message) {
        message.error(error.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <main className="login-frame" aria-label="AiDandelion 登录">
        <section className="login-brand-panel">
          <img className="login-brand-logo" src="/ai-dandelion-logo.png" alt="AiDandelion" />
          <div className="login-brand-copy">
            <p className="login-brand-kicker">AI WORKSPACE</p>
            <h1>把想法变成可用的功能。</h1>
            <p>进入工作台，继续管理 AI Agent、生成的功能和业务数据。</p>
          </div>
          <p className="login-brand-status"><span aria-hidden="true" />安全连接 · 工作空间已就绪</p>
        </section>

        <section className="login-form-panel">
          <div className="login-form-wrap">
            <header className="login-form-heading">
              <h2>欢迎回来</h2>
              <p>使用你的工作空间账号登录</p>
            </header>
            <Form<LoginFormValues> form={form} layout="vertical" requiredMark={false} onFinish={() => void handleSubmit()}>
              <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" size="large" />
              </Form.Item>
              <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" size="large" />
              </Form.Item>
              <Button className="login-submit-button" type="primary" htmlType="submit" block loading={submitting}>
                登录工作台
              </Button>
            </Form>
            <p className="login-form-footer">登录即表示你同意工作空间的使用规范</p>
          </div>
        </section>
      </main>
    </div>
  )
}
