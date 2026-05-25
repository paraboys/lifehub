import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
x=np.array([[1,2,3],[2,3,4],[3,4,5],[]])
y=np.array([4,5,6,7])
model= models.Sequential()

# model.add(layers.LSTM(15, activation='relu',input_shape=(3, 1)))
# model.add(layers.LSTM(15, activation='relu', return_sequences=True))
# model.add(layers.BiLSTM(15, activation='relu', input_shape=(3, 1)))   
# model.add(layers.RNN(layers.LSTMCell(15), activation='relu', input_shape=(3, 1)))

model.add(layers.Dense(1))
