# =====================
# Cross Validation
# =====================

https://www.linkedin.com/pulse/approaching-almost-any-machine-learning-problem-abhishek-thakur

# Stratified K-Fold
# ==================

from sklearn.cross_validation import StratifiedKFold
eval_size = 0.10
kf = StratifiedKFold(y, round(1.0 / eval_size))
train_indices, valid_indices = next(iter(kf))
X_train, y_train = X[train_indices], y[train_indices]
X_valid, y_valid = X[valid_indices], y[valid_indices]

# KFold
# ========

from sklearn.cross_validation import KFold
eval_size = 0.10
kf = KFold(len(y), round(1.0 / eval_size))
train_indices, valid_indices = next(iter(kf))
X_train, y_train = X[train_indices], y[train_indices]
X_valid, y_valid = X[valid_indices], y[valid_indices]

# =====================
# Data preprocessing
# =====================

# Types of variables
# ===================
- Numerical
- Categorical
- Text

# Categorical data
# =================================
# To label
from sklearn.preprocessing import LabelEncoder
lbl_enc = LabelEncoder()
lbl_enc.fit(xtrain[categorical_features])
xtrain_cat = lbl_enc.transform(xtrain[categorical_features])

# To binary variables
from sklearn.preprocessing import OneHotEncoder
ohe = OneHotEncoder()
ohe.fit(xtrain[categorical_features])
xtrain_cat = ohe.transform(xtrain[categorical_features])

# Text data
# ============
from sklearn.feature_extraction.text import CountVectorizer
ctv = CountVectorizer()
text_data_train = ctv.fit_transform(text_data_train)
text_data_valid = ctv.fit_transform(text_data_valid)

from sklearn.feature_extraction.text import CountVectorizer
tfv = TfidfVectorizer()
text_data_train = tfv.fit_transform(text_data_train)
text_data_valid = tfv.fit_transform(text_data_valid)

# Combine/Stack all the features
# ===============================
import numpy as np
from scipy import sparse

# dense data
X = np.stack((x1, x2, ...))

# sparse data
X = sparse.hstack((x1, x2, ...))


# Decomposition methods, dimensionality reduction
# ===============================================
- PCA
- LDA
- QDA
- SVD (useful for text)
- TruncatedSVD (useful for text)


# Feature selection
# =================
# Using xgboost
import xgboost as xgb
model = xgb.train(params, dtrain, num_boost_round=100)
sorted(model.get_fscore().items(), key=lambda t: -t[1])

# Using chi-2 based
from sklearn.feature_selection import SelectKBest
from sklearn.feature_selection import chi2
skb = SelectKBest(chi2, k=20)
skb.fit_transform(X, y)


# ===================
# Model selection
# ====================

# Model types
# ===============
Linear models: 
- require normalized data

Tree based:
- RandomForestClassifier
- RandomForestRegressor
- ExtraTreesClassifier
- ExtraTreesRegressor
- XGBClassifier
- XGBRegressor

# Task based
# ===========
Classification:
- Random forest
- GBM
- Logistic regression
- Naive bayes
- SVM
- k-nearest neighbours

Regression:
- Random forest
- GBM
- Linear regression
- Ridge
- Lasso
- SVR