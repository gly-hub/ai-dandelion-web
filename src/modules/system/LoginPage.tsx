import { useState } from 'react'
import { App, Button, Card, Form, Input } from 'antd'
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
      <Card
        className="login-card"
        title={(
          <span className="login-brand-title">
            <img className="login-brand-logo" src="/ai-dandelion-logo.png" alt="AiDandelion" />
            <span>登录</span>
          </span>
        )}
      >
        <Form<LoginFormValues> form={form} layout="vertical" requiredMark="optional">
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" block loading={submitting} onClick={() => void handleSubmit()}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
