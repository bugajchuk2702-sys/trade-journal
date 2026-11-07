import React from 'react'

// Поле даты, которое открывает календарь по клику в любом месте поля
// (по умолчанию Firefox открывает его только по значку календаря справа).
export default function DateInput({ onClick, ...rest }) {
  return (
    <input
      type="date"
      {...rest}
      onClick={(e) => {
        try {
          e.currentTarget.showPicker()
        } catch {
          // старый браузер или календарь уже открыт — остаётся обычное поведение поля
        }
        onClick && onClick(e)
      }}
    />
  )
}
